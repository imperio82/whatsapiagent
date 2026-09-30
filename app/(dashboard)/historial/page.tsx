import { Activity, FileClock } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Card, CardContent } from "@components/ui/card";

export default function HistoryPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Historial de actividad</h1>
          <p className="text-sm text-muted-foreground">
            Auditoría de quién hizo qué: cambios de pedidos, mensajes enviados, accesos al sistema.
          </p>
        </div>
        <Badge variant="outline">Próximamente</Badge>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="rounded-full bg-muted p-3">
            <FileClock className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Sin eventos registrados todavía</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Cuando los agentes empiecen a interactuar con pedidos, clientes y conversaciones,
              cada acción se va a registrar aquí con marca de tiempo.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" /> Telemetría desactivada en desarrollo
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
