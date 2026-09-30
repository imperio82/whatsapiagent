import { BarChart3, ChartPie, Clock, Sparkles, TrendingUp, Users } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Card, CardContent } from "@components/ui/card";

const REPORTS = [
  {
    icon: TrendingUp,
    title: "Ventas por período",
    description: "Total facturado, tickets cerrados y promedio por pedido. Filtrable por día, semana o mes.",
  },
  {
    icon: ChartPie,
    title: "Conversión de leads",
    description: "Funnel de NEW → CONTACTED → READY_TO_BUY → CUSTOMER con tiempo promedio en cada etapa.",
  },
  {
    icon: Users,
    title: "Top clientes",
    description: "Ranking por monto gastado, frecuencia de compra y última interacción.",
  },
  {
    icon: Sparkles,
    title: "Performance de IA",
    description: "Cuántas conversaciones cerró sin intervención humana y qué mensajes funcionan mejor.",
  },
  {
    icon: Clock,
    title: "Tiempo de respuesta",
    description: "Cuánto tarda tu equipo (y la IA) en responder, por horario y agente.",
  },
  {
    icon: BarChart3,
    title: "Productos más vendidos",
    description: "Ranking de productos por unidades, ingreso y velocidad de salida.",
  },
];

export default function ReportsPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Estos serán los reportes disponibles cuando acumules suficientes datos.
          </p>
        </div>
        <Badge variant="outline">Próximamente</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.title} className="border-dashed">
              <CardContent className="p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="font-semibold">{r.title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
