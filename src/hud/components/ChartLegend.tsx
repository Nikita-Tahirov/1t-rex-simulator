/**
 * Внешняя легенда для uPlot-графиков. uPlot строит свою live-legend ниже
 * canvas, что переполняет фиксированный по высоте контейнер карточки и
 * вытесняет полезное пространство графика. Эту легенду рисуем сами рядом
 * с графиком, передавая те же цвета, что и в `options.series[*].stroke`.
 */
export interface ChartLegendItem {
  readonly label: string;
  readonly color: string;
}

export function ChartLegend({ items }: { items: readonly ChartLegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--color-text-dim)]">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
