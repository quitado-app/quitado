// Pays a Quitado invoice from the throwaway devnet wallet, like a customer's wallet would:
//
//   node src/pay-invoice.ts <reference> <amount>
//
// <reference> is the invoice's Solana Pay reference (it is inside the payment link) and <amount>
// is plain decimal text of the test token, e.g. 12.5. Devnet only, test token only.
import { getTransferCheckedInstruction } from '@solana-program/token';
import { AccountRole, type Address } from '@solana/kit';
import { loadOrCreateSigner, loadState, send } from './common.ts';

const [reference, amountText] = process.argv.slice(2);
if (!reference || !amountText || !/^\d+(\.\d+)?$/.test(amountText)) {
  console.error('usage: node src/pay-invoice.ts <reference> <amount>');
  process.exit(1);
}

const state = loadState<{
  mint: Address;
  decimals: number;
  payerAta: Address;
  merchantAta: Address;
}>();
if (!state) throw new Error('run `node src/setup.ts` first');
const payer = await loadOrCreateSigner('payer');

const [whole = '0', fraction = ''] = amountText.split('.');
if (fraction.length > state.decimals) throw new Error(`at most ${state.decimals} decimal places`);
const base = BigInt(whole + fraction.padEnd(state.decimals, '0'));

const transfer = getTransferCheckedInstruction({
  source: state.payerAta,
  mint: state.mint,
  destination: state.merchantAta,
  authority: payer,
  amount: base,
  decimals: state.decimals,
});
const signature = await send(payer, [
  {
    ...transfer,
    accounts: [...transfer.accounts, { address: reference as Address, role: AccountRole.READONLY }],
  },
]);
console.log(`paid ${amountText} to the merchant, citing ${reference}\nsignature: ${signature}`);
setTimeout(() => process.exit(), 100);
