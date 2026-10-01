export interface ExpenseImportInputRow {
  rowNumber?: number
  tanggal?: unknown
  wallet?: unknown
  kategori?: unknown
  nominal?: unknown
  catatan?: unknown
}

export interface ExpenseImportMaster {
  wallets: { id: string; name: string }[]
  categories: { name: string }[]
}

export interface ValidExpenseImportRow {
  rowNumber: number
  trxDate: string
  walletId: string
  walletName: string
  category: string
  amount: number
  note: string | null
}

export interface ExpenseImportError {
  rowNumber: number
  message: string
}

function normalizedText(value: unknown): string {
  return String(value ?? '').replace(/\uFEFF/g, '').trim().replace(/\s+/g, ' ')
}

function normalizedLookupKey(value: unknown): string {
  return normalizedText(value).toLocaleLowerCase('id-ID')
}

function isValidYmd(ymd: string): boolean {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
}

/** Normalize a spreadsheet date to the format accepted by the wallet API. */
export function normalizeExpenseImportDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const text = normalizedText(value)
  const ymd = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (ymd) {
    const date = `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
    return isValidYmd(date) ? date : null
  }

  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) {
    const date = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    return isValidYmd(date) ? date : null
  }

  return null
}

/** Rupiah must be a positive integer. Both Indonesian and English thousands separators are accepted. */
export function normalizeExpenseImportAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? value : null
  }

  const text = normalizedText(value)
    .replace(/^rp\.?\s*/i, '')
    .replace(/\s/g, '')

  if (!text || text.startsWith('-')) return null
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(text)) return null

  const amount = Number(text.replace(/[.,]/g, ''))
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 2_147_483_647 ? amount : null
}

export function validateExpenseImportRows(
  inputRows: ExpenseImportInputRow[],
  master: ExpenseImportMaster,
): { validRows: ValidExpenseImportRow[]; errors: ExpenseImportError[]; totalAmount: number } {
  const walletMap = new Map(master.wallets.map(wallet => [normalizedLookupKey(wallet.name), wallet]))
  const categoryMap = new Map(master.categories.map(category => [normalizedLookupKey(category.name), category]))
  const validRows: ValidExpenseImportRow[] = []
  const errors: ExpenseImportError[] = []

  inputRows.forEach((row, index) => {
    const rowNumber = Number.isInteger(row.rowNumber) && (row.rowNumber as number) > 0 ? row.rowNumber as number : index + 2
    const messages: string[] = []
    const trxDate = normalizeExpenseImportDate(row.tanggal)
    const wallet = walletMap.get(normalizedLookupKey(row.wallet))
    const category = categoryMap.get(normalizedLookupKey(row.kategori))
    const amount = normalizeExpenseImportAmount(row.nominal)

    if (!trxDate) messages.push('Tanggal tidak valid (gunakan YYYY-MM-DD)')
    if (!wallet) messages.push('Wallet tidak ditemukan atau tidak aktif')
    if (!category) messages.push('Kategori tidak ditemukan atau tidak aktif')
    if (!amount) messages.push('Nominal harus berupa Rupiah positif tanpa desimal')

    if (messages.length) {
      errors.push({ rowNumber, message: messages.join('. ') })
      return
    }

    validRows.push({
      rowNumber,
      trxDate: trxDate!,
      walletId: wallet!.id,
      walletName: wallet!.name,
      category: category!.name,
      amount: amount!,
      note: normalizedText(row.catatan) || null,
    })
  })

  return {
    validRows,
    errors,
    totalAmount: validRows.reduce((total, row) => total + row.amount, 0),
  }
}
