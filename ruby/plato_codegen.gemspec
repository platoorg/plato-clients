# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name        = "plato_codegen"
  spec.version     = "0.1.0"
  spec.authors     = ["Plato"]
  spec.summary     = "Generate an idiomatic Ruby client from a plato-manifest.json"
  spec.description = <<~DESC
    Reads a plato-manifest.json and emits a fully typed, idiomatic Ruby client
    (plato_client.rb) using only the Ruby standard library (json, net/http, uri).
    No runtime dependencies — the generated file is equally dependency-free.
  DESC

  spec.license = "MIT"

  spec.required_ruby_version = ">= 3.0"

  spec.files         = Dir["lib/**/*.rb", "exe/*"]
  spec.executables   = ["plato-codegen"]
  spec.require_paths = ["lib"]

  # No runtime gems — stdlib only.
  # Development conveniences (optional, not required to run the gem).
  spec.metadata = {
    "rubygems_mfa_required" => "true"
  }
end
