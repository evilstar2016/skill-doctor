// Synthetic data only. Never deploy this deliberately vulnerable example.
const invoices = {
  'inv-alice': { owner: 'alice', amount: 120 },
  'inv-bob': { owner: 'bob', amount: 980 },
};
export function vulnerableRead(user, invoiceId) {
  return invoices[invoiceId];
}
export function authorizedRead(user, invoiceId) {
  const invoice = invoices[invoiceId];
  if (!invoice || invoice.owner !== user) return { error: 'forbidden' };
  return invoice;
}
