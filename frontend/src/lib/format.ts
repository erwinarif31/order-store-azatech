import type { Money } from './store'
const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Intl accepts decimal strings directly, without a lossy Number conversion.
export const money = currency.format as (value: Money) => string
export const dateTime = (value: string) => `${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`

function minorUnits(value: Money): bigint {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fraction = ''] = coefficient!.split('.')
  const digits = BigInt(`${whole}${fraction}`)
  const scale = 2 + Number(exponent) - fraction.length
  if (scale >= 0) return digits * 10n ** BigInt(scale)
  const divisor = 10n ** BigInt(-scale)
  return (digits + divisor / 2n) / divisor
}

function decimal(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`
}

export function estimate(items: { price: Money; quantity: number }[]) {
  const subtotal = items.reduce((sum, item) => {
    const quantity = Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 2147483647 ? item.quantity : 0
    return sum + minorUnits(item.price) * BigInt(quantity)
  }, 0n)
  const rate = subtotal >= 100000000n ? 10n : subtotal >= 50000000n ? 5n : 0n
  const calculated = (subtotal * rate + 50n) / 100n
  const discount = calculated > 15000000n ? 15000000n : calculated
  return { subtotal: decimal(subtotal), discount: decimal(discount), total: decimal(subtotal - discount) }
}
