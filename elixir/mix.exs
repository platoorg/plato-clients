defmodule PlatoCodegen.MixProject do
  use Mix.Project

  def project do
    [
      app: :plato_client,
      version: "0.0.1",
      elixir: "~> 1.16",
      escript: [main_module: PlatoCodegen.CLI],
      deps: []
    ]
  end
end
