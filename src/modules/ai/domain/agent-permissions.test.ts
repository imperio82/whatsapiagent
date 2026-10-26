import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentPermissionsFrom, filterToolsByPermissions, permissionRestrictions, resourcesFor } from "./agent-permissions";

const tools = (...names: string[]) => names.map((name) => ({ name }));
const names = (list: { name: string }[]) => list.map((t) => t.name);

describe("agentPermissionsFrom", () => {
  it("sin configurar, acceso completo en las áreas del perfil", () => {
    assert.deepEqual(agentPermissionsFrom(null, "RETAIL"), { catalog: "read", clients: "write", orders: "write", leads: "none", appointments: "none" });
    assert.deepEqual(agentPermissionsFrom(undefined, "BROKERAGE"), {
      catalog: "write",
      clients: "write",
      orders: "none",
      leads: "write",
      appointments: "write",
    });
  });

  it("un nivel que no aplica al área baja al permitido inferior", () => {
    // Pedidos no tiene "actualización": queda en lectura
    assert.equal(agentPermissionsFrom({ orders: "update" }, "RETAIL").orders, "read");
    // El catálogo de la tienda solo llega a lectura
    assert.equal(agentPermissionsFrom({ catalog: "write" }, "RETAIL").catalog, "read");
  });

  it("ignora valores inválidos", () => {
    assert.equal(agentPermissionsFrom({ clients: "admin" }, "RETAIL").clients, "write");
  });
});

describe("filterToolsByPermissions", () => {
  const retail = tools("search_products", "get_business_info", "save_client_info", "save_special_date", "create_pending_order");

  it("con acceso completo no quita nada", () => {
    assert.deepEqual(names(filterToolsByPermissions(retail, agentPermissionsFrom(null, "RETAIL"))), names(retail));
  });

  it("quita las herramientas sin permiso y deja las del negocio", () => {
    const perms = agentPermissionsFrom({ orders: "read", clients: "update" }, "RETAIL");
    assert.deepEqual(names(filterToolsByPermissions(retail, perms)), ["search_products", "get_business_info", "save_client_info"]);
  });

  it("en intermediación, la agenda se limita por nivel", () => {
    const agenda = tools("check_availability", "cancel_visit", "request_visit");
    assert.deepEqual(names(filterToolsByPermissions(agenda, agentPermissionsFrom({ appointments: "read" }, "BROKERAGE"))), ["check_availability"]);
    assert.deepEqual(names(filterToolsByPermissions(agenda, agentPermissionsFrom({ appointments: "update" }, "BROKERAGE"))), [
      "check_availability",
      "cancel_visit",
    ]);
    assert.deepEqual(names(filterToolsByPermissions(agenda, agentPermissionsFrom({ appointments: "none" }, "BROKERAGE"))), []);
  });
});

describe("permissionRestrictions", () => {
  it("con acceso completo no agrega nada al prompt", () => {
    assert.equal(permissionRestrictions(agentPermissionsFrom(null, "BROKERAGE"), "BROKERAGE"), null);
  });

  it("le dice al agente qué hacer en lugar de lo que no puede", () => {
    const text = permissionRestrictions(agentPermissionsFrom({ orders: "read" }, "RETAIL"), "RETAIL")!;
    assert.match(text, /No creas pedidos/);
    assert.doesNotMatch(text, /pedidos anteriores/);
  });

  it("sin acceso a un área incluye todas sus restricciones", () => {
    const text = permissionRestrictions(agentPermissionsFrom({ clients: "none" }, "RETAIL"), "RETAIL")!;
    assert.match(text, /No conoces la ficha/);
    assert.match(text, /No guardas datos en la ficha/);
    assert.match(text, /No guardas fechas especiales/);
  });

  it("cada perfil muestra solo sus áreas", () => {
    assert.deepEqual(resourcesFor("RETAIL"), ["catalog", "clients", "orders"]);
    assert.deepEqual(resourcesFor("BROKERAGE"), ["catalog", "clients", "leads", "appointments"]);
  });
});
