defmodule PlatoCodegen.MixProject do
  use Mix.Project

  def project do
    [
      app: :plato_codegen,
      version: "0.1.0",
      elixir: "~> 1.16",
      escript: [main_module: PlatoCodegen.CLI],
      deps: []
    ]
  end
end
