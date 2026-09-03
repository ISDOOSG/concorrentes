/**
 * Testes de MONTAGEM e de RÓTULO.
 *
 * Existem porque em 03/09/2026 a suíte da API estava verde, o `npm run
 * build` passava e o site respondia 200 em todas as rotas — e mesmo assim
 * havia seis controles na tela que não faziam absolutamente nada, e duas
 * abas que prometiam dado que nunca chegaria.
 *
 * O que se afirma aqui é o que um build nunca vê: que o controle existe,
 * que tem texto legível (não só `title`, que demora ~1s e não existe em
 * toque) e que o componente monta sem estourar.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/ic/app-sidebar";
import { AppTopbar } from "@/components/ic/app-topbar";

// O topo e a barra usam <Link> do TanStack Router, que exige um roteador
// montado. Para um teste de rótulo isso é peso morto: o dublo mantém o
// elemento e o texto, que é o que se está afirmando.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...resto }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...resto}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ic/demo-mode-toggle", () => ({
  DemoModeToggle: () => null,
}));
vi.mock("@/components/ic/theme-toggle", () => ({ ThemeToggle: () => null }));

describe("barra lateral", () => {
  it("mostra os oito destinos, e todos com texto", () => {
    render(<AppSidebar current="dashboard" onNavigate={() => {}} />);
    // Escopado ao <nav>: "Concorrentes" tambem e o nome do produto na marca,
    // logo acima -- procurar na tela inteira acha dois e falha por empate.
    const menu = within(screen.getByRole("navigation"));
    for (const rotulo of [
      "Dashboard",
      "Concorrentes",
      "Comparar",
      "Alertas",
      "Análise SWOT",
      "Adicionar concorrente",
      "Configurações",
      "Ajuda",
    ]) {
      expect(menu.getByText(rotulo)).toBeInTheDocument();
    }
  });

  it("cada destino dispara a navegação", async () => {
    const ida = vi.fn();
    render(<AppSidebar current="dashboard" onNavigate={ida} />);
    within(screen.getByRole("navigation")).getByText("Ajuda").click();
    expect(ida).toHaveBeenCalledWith("help");
  });

  it("não inventa plano quando o perfil não trouxe um", () => {
    // "Plano Free" estava escrito no código e aparecia para todo mundo,
    // qualquer que fosse o plano real no banco.
    render(<AppSidebar current="dashboard" onNavigate={() => {}} />);
    expect(screen.queryByText(/Plano/)).not.toBeInTheDocument();
  });

  it("mostra o plano que recebe", () => {
    render(
      <AppSidebar current="dashboard" onNavigate={() => {}} userPlan="Plano Pro" />,
    );
    expect(screen.getByText("Plano Pro")).toBeInTheDocument();
  });
});

describe("barra do topo", () => {
  it("não mostra campo de busca quando ninguém filtra", () => {
    // O campo estava nas 11 telas com handler opcional e NENHUMA o passava:
    // dava para digitar em qualquer lugar e nada acontecia.
    render(<AppTopbar title="Alertas" />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("mostra a busca, com o texto de ajuda certo, quando há filtro", () => {
    render(
      <AppTopbar
        title="Concorrentes"
        onSearchChange={() => {}}
        searchPlaceholder="Buscar por nome ou domínio…"
      />,
    );
    expect(
      screen.getByPlaceholderText("Buscar por nome ou domínio…"),
    ).toBeInTheDocument();
  });

  it("o sino leva aos alertas, em vez de não fazer nada", () => {
    // Era um <button> sem onClick, em todas as telas.
    render(<AppTopbar title="Dashboard" alertsCount={3} />);
    const sino = screen.getByLabelText("Alertas");
    expect(sino).toHaveAttribute("href", "/alerts");
  });

  it("não tem mais o botão Exportar, que não exportava nada", () => {
    render(<AppTopbar title="Dashboard" />);
    expect(screen.queryByTitle("Exportar")).not.toBeInTheDocument();
  });
});
