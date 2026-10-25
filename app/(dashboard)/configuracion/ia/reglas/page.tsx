import { redirect } from "next/navigation";

/** La pantalla ahora se llama "Habilidades del agente"; los enlaces viejos siguen funcionando. */
export default function OldAiRulesPage(): never {
  redirect("/configuracion/ia/habilidades");
}
