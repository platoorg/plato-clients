# frozen_string_literal: true

require "minitest/autorun"
require "stringio"
require_relative "../lib/plato_codegen"

class SupersetExpansionTest < Minitest::Test
  def test_inlines_superset_fields_before_own_fields
    manifest = {
      "namespace" => "test",
      "supersets" => [
        { "name" => "base", "fields" => [{ "name" => "title", "type" => "string", "required" => true }] }
      ],
      "schemas" => [
        { "name" => "post", "type" => "collection", "fields" => [{ "name" => "body", "type" => "string" }], "extends" => ["base"] }
      ]
    }

    result = PlatoCodegen.send(:expand_manifest, manifest)
    names = result["schemas"][0]["fields"].map { |f| f["name"] }
    assert_equal ["title", "body"], names
  end

  def test_own_field_overrides_superset_field_in_place
    manifest = {
      "namespace" => "test",
      "supersets" => [
        {
          "name" => "base",
          "fields" => [
            { "name" => "title", "type" => "string", "required" => false },
            { "name" => "slug", "type" => "string" }
          ]
        }
      ],
      "schemas" => [
        {
          "name" => "post",
          "type" => "collection",
          "fields" => [{ "name" => "title", "type" => "string", "required" => true }],
          "extends" => ["base"]
        }
      ]
    }

    result = PlatoCodegen.send(:expand_manifest, manifest)
    fields = result["schemas"][0]["fields"]
    assert_equal ["title", "slug"], fields.map { |f| f["name"] }
    assert_equal true, fields[0]["required"]
  end

  def test_unknown_superset_skipped_with_warning
    manifest = {
      "namespace" => "test",
      "schemas" => [
        {
          "name" => "post",
          "type" => "collection",
          "fields" => [{ "name" => "body", "type" => "string" }],
          "extends" => ["nonexistent"]
        }
      ]
    }

    old_stderr = $stderr
    $stderr = StringIO.new
    result = PlatoCodegen.send(:expand_manifest, manifest)
    warning_output = $stderr.string
    $stderr = old_stderr

    names = result["schemas"][0]["fields"].map { |f| f["name"] }
    assert_equal ["body"], names
    assert_match(/nonexistent/, warning_output)
  end

  def test_builtin_page_superset_works_without_user_declaration
    manifest = {
      "namespace" => "test",
      "schemas" => [
        {
          "name" => "blog_post",
          "type" => "collection",
          "fields" => [{ "name" => "author", "type" => "string" }],
          "extends" => ["page"]
        }
      ]
    }

    result = PlatoCodegen.send(:expand_manifest, manifest)
    names = result["schemas"][0]["fields"].map { |f| f["name"] }
    assert_includes names, "title"
    assert_includes names, "body"
    assert_includes names, "meta_description"
    assert_includes names, "cover_image"
    assert_includes names, "author"
    assert names.index("title") < names.index("author")
  end

  def test_user_superset_overrides_builtin
    manifest = {
      "namespace" => "test",
      "supersets" => [
        { "name" => "page", "fields" => [{ "name" => "custom_title", "type" => "string", "required" => true }] }
      ],
      "schemas" => [
        { "name" => "blog_post", "type" => "collection", "fields" => [], "extends" => ["page"] }
      ]
    }

    result = PlatoCodegen.send(:expand_manifest, manifest)
    names = result["schemas"][0]["fields"].map { |f| f["name"] }
    assert_equal ["custom_title"], names
  end

  def test_extends_cleared_after_expansion
    manifest = {
      "namespace" => "test",
      "supersets" => [
        { "name" => "base", "fields" => [{ "name" => "title", "type" => "string" }] }
      ],
      "schemas" => [
        { "name" => "post", "type" => "collection", "fields" => [], "extends" => ["base"] }
      ]
    }

    result = PlatoCodegen.send(:expand_manifest, manifest)
    assert_equal [], result["schemas"][0]["extends"]
  end

  def test_schema_without_extends_unchanged
    manifest = {
      "namespace" => "test",
      "schemas" => [
        { "name" => "post", "type" => "collection", "fields" => [{ "name" => "title", "type" => "string" }] }
      ]
    }

    result = PlatoCodegen.send(:expand_manifest, manifest)
    names = result["schemas"][0]["fields"].map { |f| f["name"] }
    assert_equal ["title"], names
  end
end
