"use client";

import { Bar, Doughnut } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

type Props = {
  bar: { labels: string[]; trendyol: number[]; web: number[] };
  doughnut: { values: number[]; amounts: number[] };
};

function fmtMoney(n: number) {
  return `₺${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

export default function DashboardCharts({ bar, doughnut }: Props) {
  const barData = {
    labels: bar.labels,
    datasets: [
      { label: "Trendyol", data: bar.trendyol, backgroundColor: "rgba(74, 93, 69, 0.75)", borderRadius: 8 },
      { label: "Web", data: bar.web, backgroundColor: "rgba(120, 113, 108, 0.55)", borderRadius: 8 },
    ],
  };

  const doughnutData = {
    labels: ["Trendyol", "Web"],
    datasets: [
      {
        data: doughnut.values,
        backgroundColor: ["rgba(74, 93, 69, 0.85)", "rgba(120, 113, 108, 0.65)"],
        borderWidth: 0,
      },
    ],
  };

  const chartOpts: ChartOptions<"bar"> = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: { legend: { labels: { font: { size: 11 } } } },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } },
      y: { ticks: { font: { size: 10 } } },
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="erp-card lg:col-span-2 p-4 md:p-6">
        <h3 className="font-bold text-[var(--erp-text)] mb-3">Haftalık Satış</h3>
        <div className="h-44 md:h-72">
          <Bar data={barData} options={chartOpts} />
        </div>
      </div>
      <div className="erp-card p-4 md:p-6">
        <h3 className="font-bold text-[var(--erp-text)] mb-3">Platform</h3>
        <div className="h-40 md:h-56 flex flex-col items-center justify-center gap-2">
          <Doughnut data={doughnutData} options={{ maintainAspectRatio: false }} />
          <p className="text-xs erp-muted text-center">
            TY {fmtMoney(doughnut.amounts[0] ?? 0)} · Web {fmtMoney(doughnut.amounts[1] ?? 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
