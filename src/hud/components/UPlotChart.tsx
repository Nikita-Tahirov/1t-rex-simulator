import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEffect, useRef } from 'react';

/**
 * Лёгкая обёртка над uPlot. Создаёт инстанс при монтировании, обновляет
 * данные через `setData` при изменении `data`. Размер слежится через
 * ResizeObserver. Опции запоминаются на момент mount; для пересборки графика
 * родителю достаточно сменить React `key`.
 *
 * Использовать ТОЛЬКО с `options.legend = { show: false }`. uPlot-овская
 * live-legend конструктивно конфликтует с фиксированной по высоте Card:
 * она добавляется ниже canvas вне `options.height` и обрезается. Внешнюю
 * легенду рисуем компонентом `ChartLegend` рядом с графиком.
 */
export function UPlotChart({
  data,
  options,
  className = '',
}: {
  data: uPlot.AlignedData;
  options: uPlot.Options;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const optionsRef = useRef<uPlot.Options>(options);
  const dataRef = useRef<uPlot.AlignedData>(data);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const initOptions = optionsRef.current;
    const w = el.clientWidth || initOptions.width || 300;
    const h = el.clientHeight || initOptions.height || 120;
    const opts: uPlot.Options = { ...initOptions, width: w, height: h };
    plotRef.current = new uPlot(opts, dataRef.current, el);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !plotRef.current) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        plotRef.current.setSize({ width, height });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, []);

  // Обновление данных без пересоздания.
  useEffect(() => {
    if (plotRef.current) {
      plotRef.current.setData(data);
    }
  }, [data]);

  return <div ref={containerRef} className={className} />;
}
