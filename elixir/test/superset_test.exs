defmodule PlatoCodegen.SupersetTest do
  use ExUnit.Case, async: true
  import ExUnit.CaptureIO

  defp manifest_with(schemas, supersets \\ []) do
    %{
      namespace: "test",
      public: false,
      supersets: supersets,
      schemas: schemas
    }
  end

  test "inlines superset fields before own fields" do
    manifest =
      manifest_with(
        [
          %{
            name: "post",
            type: "collection",
            fields: [%{name: "body", type: "string", required: false}],
            extends: ["base"]
          }
        ],
        [%{name: "base", fields: [%{name: "title", type: "string", required: true}]}]
      )

    source = PlatoCodegen.generate(manifest)
    assert source =~ "title"
    assert source =~ "body"
    title_pos = :binary.match(source, "title") |> elem(0)
    body_pos = :binary.match(source, "body") |> elem(0)
    assert title_pos < body_pos
  end

  test "own field overrides superset field of same name in place" do
    manifest =
      manifest_with(
        [
          %{
            name: "post",
            type: "collection",
            fields: [%{name: "title", type: "string", required: true}],
            extends: ["base"]
          }
        ],
        [
          %{
            name: "base",
            fields: [
              %{name: "title", type: "string", required: false},
              %{name: "slug", type: "string", required: false}
            ]
          }
        ]
      )

    source = PlatoCodegen.generate(manifest)
    assert source =~ "slug"
    assert source =~ "title"
  end

  test "unknown superset name is skipped with a warning" do
    manifest =
      manifest_with([
        %{
          name: "post",
          type: "collection",
          fields: [%{name: "body", type: "string", required: false}],
          extends: ["nonexistent"]
        }
      ])

    assert capture_io(:stderr, fn ->
             PlatoCodegen.generate(manifest)
           end) =~ "nonexistent"
  end

  test "built-in page superset works without user declaration" do
    manifest =
      manifest_with([
        %{
          name: "blog_post",
          type: "collection",
          fields: [%{name: "author", type: "string", required: false}],
          extends: ["page"]
        }
      ])

    source = PlatoCodegen.generate(manifest)
    assert source =~ "title"
    assert source =~ "body"
    assert source =~ "meta_description"
    assert source =~ "cover_image"
    assert source =~ "author"
  end

  test "user-declared superset with same name as built-in replaces it" do
    manifest =
      manifest_with(
        [
          %{
            name: "blog_post",
            type: "collection",
            fields: [],
            extends: ["page"]
          }
        ],
        [%{name: "page", fields: [%{name: "custom_title", type: "string", required: true}]}]
      )

    source = PlatoCodegen.generate(manifest)
    assert source =~ "custom_title"
    refute source =~ ":body"
  end

  test "schema without extends produces correct output" do
    manifest =
      manifest_with([
        %{
          name: "post",
          type: "collection",
          fields: [%{name: "title", type: "string", required: true}]
        }
      ])

    source = PlatoCodegen.generate(manifest)
    assert source =~ "title"
  end
end
