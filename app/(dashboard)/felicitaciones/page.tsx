import { redirect } from "next/navigation";

/** Las felicitaciones ahora son una pestaña de Recordatorios. */
export default function GreetingsRedirect(): never {
  redirect("/recordatorios?tipo=felicitaciones");
}
