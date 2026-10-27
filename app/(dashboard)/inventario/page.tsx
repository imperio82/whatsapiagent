import { redirect } from "next/navigation";

/** El inventario ahora se ve y se edita como una colección. */
export default function InventoryPage(): never {
  redirect("/colecciones/sistema-inventario");
}
