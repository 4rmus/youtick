export function parseLivepeerPriceUsdc(value: string): string {
    const match = value.trim().match(/^(\d{1,8})(?:\.(\d{1,6}))?$/);
    if (!match) throw new Error('invalid_ticket_price');
    const amount = BigInt(match[1]) * 1_000_000n + BigInt((match[2] || '').padEnd(6, '0'));
    if (amount < 2_000_000n) throw new Error('invalid_ticket_price');
    return amount.toString();
}
