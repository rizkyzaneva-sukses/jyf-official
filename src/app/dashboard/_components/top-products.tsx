'use client'

import { formatRupiah } from '@/lib/utils'

type TopProduct = {
  key: string
  productName: string
  sku: string
  totalQty: number
  gmv: number
  orderCount: number
}

export function TopProducts({
  products,
  isLoading,
}: {
  products: TopProduct[]
  isLoading: boolean
}) {
  if (isLoading) {
    return <div className="h-64 rounded-xl bg-zinc-900/60 animate-pulse" />
  }

  if (!products?.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-600">
        Belum ada order valid pada periode ini.
      </div>
    )
  }

  const maxGmv = Math.max(...products.map(p => p.gmv), 1)

  return (
    <div className="stat-card divide-y divide-zinc-800/80">
      {products.map((product, index) => {
        const productLabel = product.productName || product.sku || 'Produk tanpa SKU'
        const showSku = product.sku && product.sku !== productLabel
        const rankColor = index === 0
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
          : 'bg-zinc-800 text-zinc-400 border-zinc-700'

        return (
          <div key={product.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${rankColor}`}>
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200" title={productLabel}>{productLabel}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {showSku ? `${product.sku} · ` : ''}{product.totalQty} pcs · {product.orderCount} order
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-semibold text-emerald-400">
                  {formatRupiah(product.gmv, true)}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${(product.gmv / maxGmv) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
