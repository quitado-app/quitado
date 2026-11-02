// Runs the Solana Pay payment flow on devnet and checks the edge cases that decide how Quitado
// detects payments. Needs `node src/setup.ts` to have run first.
import assert from 'node:assert/strict';
import { getAddMemoInstruction } from '@solana-program/memo';
import { getTransferCheckedInstruction } from '@solana-program/token';
import {
  AccountRole,
  generateKeyPairSigner,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import {
  createTransfer,
  encodeURL,
  findReference,
  parseURL,
  validateTransfer,
  type TransferFields,
} from '@solana/pay';
import { detectPayment } from './detect.ts';
import { createTestMint, loadOrCreateSigner, loadState, rpc, send } from './common.ts';

interface State {
  mint: Address;
  decimals: number;
  payerAta: Address;
  merchantAta: Address;
}

const state = loadState<State>();
if (!state) throw new Error('run `node src/setup.ts` first');
const payer = await loadOrCreateSigner('payer');
const merchant = await loadOrCreateSigner('merchant');

const results: { name: string; ok: boolean; note: string }[] = [];

// ONLY=5,6 runs just those scenarios (the public devnet RPC rate-limits long runs with HTTP 429).
const only = process.env.ONLY?.split(',');

async function scenario(name: string, run: () => Promise<string>) {
  if (only && !only.includes(name.split(' ')[0]!)) return;
  // Space the scenarios out so the public RPC does not answer 429.
  await new Promise((resolve) => setTimeout(resolve, 4000));
  try {
    results.push({ name, ok: true, note: await run() });
  } catch (error) {
    results.push({ name, ok: false, note: error instanceof Error ? error.message : String(error) });
  }
  const last = results.at(-1)!;
  console.log(`${last.ok ? 'PASS' : 'FAIL'}  ${name}: ${last.note}`);
}

/** Polls until `fn` stops throwing: devnet RPC nodes can lag a moment behind a confirmed tx. */
async function eventually<T>(fn: () => Promise<T>, tries = 15): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw last;
}

async function rejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<string> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, pattern);
    return message;
  }
  throw new Error('expected a rejection but the call succeeded');
}

/** A hand-built transferChecked of `base` units that cites `reference`, like a wallet would. */
function manualTransfer(
  from: KeyPairSigner,
  s: State,
  base: bigint,
  reference: Address,
  mintOverride?: { mint: Address; payerAta: Address; merchantAta: Address },
): Instruction {
  const m = mintOverride ?? s;
  const ix = getTransferCheckedInstruction({
    source: m.payerAta,
    mint: m.mint,
    destination: m.merchantAta,
    authority: from,
    amount: base,
    decimals: s.decimals,
  });
  return { ...ix, accounts: [...ix.accounts, { address: reference, role: AccountRole.READONLY }] };
}

const newReference = async () => (await generateKeyPairSigner()).address;
const fieldsFor = (amount: number, reference: Address): TransferFields => ({
  recipient: merchant.address,
  amount,
  splToken: state.mint,
  reference,
});

await scenario('1 happy path (library createTransfer)', async () => {
  const reference = await newReference();
  const fields = fieldsFor(12.5, reference);
  const url = encodeURL(fields);
  const parsed = parseURL(url.toString());
  assert.ok('recipient' in parsed && parsed.recipient === merchant.address);
  const ixs = await createTransfer(rpc, payer, fields);
  const signature = await send(payer, ixs);
  const found = await eventually(() => findReference(rpc, reference, { commitment: 'confirmed' }));
  assert.equal(found.signature, signature);
  await eventually(() =>
    validateTransfer(rpc, found.signature, fields, { commitment: 'confirmed' }),
  );
  return `url=${url.toString().slice(0, 60)}...`;
});

await scenario('2 underpayment is rejected', async () => {
  const reference = await newReference();
  await send(payer, [manualTransfer(payer, state, 19_990_000n, reference)]);
  const found = await eventually(() => findReference(rpc, reference, { commitment: 'confirmed' }));
  return rejects(
    () => validateTransfer(rpc, found.signature, fieldsFor(20, reference)),
    /amount not transferred/,
  );
});

await scenario('3 overpayment is accepted', async () => {
  const reference = await newReference();
  await send(payer, [manualTransfer(payer, state, 6_000_000n, reference)]);
  const found = await eventually(() => findReference(rpc, reference, { commitment: 'confirmed' }));
  await validateTransfer(rpc, found.signature, fieldsFor(5, reference));
  return 'paid 6, expected 5, accepted';
});

await scenario(
  '4 failed tx citing the reference first hides the real payment from findReference',
  async () => {
    const reference = await newReference();
    const fields = fieldsFor(7, reference);
    // Attacker/griefer: more than the payer owns, so it lands and fails (skipPreflight skips the simulation).
    const failed = await send(payer, [manualTransfer(payer, state, 10_000_000_000n, reference)], {
      skipPreflight: true,
      allowFailure: true,
    });
    const real = await send(payer, [manualTransfer(payer, state, 7_000_000n, reference)]);

    const found = await eventually(() =>
      findReference(rpc, reference, { commitment: 'confirmed' }),
    );
    assert.equal(
      found.signature,
      failed,
      'findReference should return the oldest (failed) signature',
    );
    assert.notEqual(found.err, null);
    await rejects(() => validateTransfer(rpc, found.signature, fields), /./);

    const detected = await eventually(async () => {
      const result = await detectPayment(rpc, reference, fields);
      if (!result) throw new Error('not detected yet');
      return result;
    });
    assert.equal(detected.signature, real);
    return `findReference -> failed tx; detectPayment -> real tx (skipped ${detected.skipped})`;
  },
);

await scenario('5 payment in a different mint is rejected', async () => {
  const reference = await newReference();
  const fake = await createTestMint(payer, merchant, state.decimals, 1_000_000_000n);
  await send(payer, [manualTransfer(payer, state, 5_000_000n, reference, fake)]);
  const found = await eventually(() => findReference(rpc, reference, { commitment: 'confirmed' }));
  const message = await rejects(
    () => validateTransfer(rpc, found.signature, fieldsFor(5, reference)),
    /invalid transfer/,
  );
  const detected = await detectPayment(rpc, reference, fieldsFor(5, reference));
  assert.equal(detected, null);
  return `${message}; detectPayment -> null`;
});

await scenario('6 trailing instruction after the transfer (wallet guard/memo)', async () => {
  const reference = await newReference();
  const fields = fieldsFor(3, reference);
  await send(payer, [
    manualTransfer(payer, state, 3_000_000n, reference),
    getAddMemoInstruction({ memo: 'wallet-appended instruction', signers: [payer] }),
  ]);
  const found = await eventually(() => findReference(rpc, reference, { commitment: 'confirmed' }));
  try {
    await validateTransfer(rpc, found.signature, fields);
    return 'validateTransfer accepted a transfer that is not the last instruction';
  } catch (error) {
    // Recorded as a finding, not a failure of the spike: it tells us how strict the library is.
    return `REJECTED by validateTransfer (${error instanceof Error ? error.message : String(error)})`;
  }
});

console.log('\nsummary:');
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
setTimeout(() => process.exit(), 100);
