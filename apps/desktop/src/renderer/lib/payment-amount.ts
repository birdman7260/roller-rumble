const usdPaymentAmountFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD"
});

export function formatPaymentAmount(
  amountCents: number | null | undefined,
  currency: string
): string {
  if (typeof amountCents !== "number") {
    return "Not set";
  }

  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "USD") {
    return usdPaymentAmountFormatter.format(amountCents / 100);
  }

  return `${normalizedCurrency} ${(amountCents / 100).toFixed(2)}`;
}
