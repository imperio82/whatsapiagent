import { redirect } from "next/navigation";

/** Los productos ahora se ven y se editan como una colección. */
export default function ProductsPage(): never {
  redirect("/colecciones/sistema-productos");
}
