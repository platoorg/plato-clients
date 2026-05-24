package main

import (
	"testing"
)

func TestExpandManifest_InlinesSuperset(t *testing.T) {
	manifest := Manifest{
		Namespace: "test",
		Supersets: []ManifestSuperset{
			{Name: "base", Fields: []ManifestField{
				{Name: "title", Type: "string", Required: true},
			}},
		},
		Schemas: []ManifestSchema{
			{
				Name:    "post",
				Type:    "collection",
				Fields:  []ManifestField{{Name: "body", Type: "string"}},
				Extends: []string{"base"},
			},
		},
	}

	result := expandManifest(manifest)
	fields := result.Schemas[0].Fields
	if len(fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(fields))
	}
	if fields[0].Name != "title" {
		t.Errorf("expected first field to be title, got %s", fields[0].Name)
	}
	if fields[1].Name != "body" {
		t.Errorf("expected second field to be body, got %s", fields[1].Name)
	}
}

func TestExpandManifest_OverrideReplacesInPlace(t *testing.T) {
	manifest := Manifest{
		Namespace: "test",
		Supersets: []ManifestSuperset{
			{Name: "base", Fields: []ManifestField{
				{Name: "title", Type: "string", Required: false},
				{Name: "slug", Type: "string"},
			}},
		},
		Schemas: []ManifestSchema{
			{
				Name:    "post",
				Type:    "collection",
				Fields:  []ManifestField{{Name: "title", Type: "string", Required: true}},
				Extends: []string{"base"},
			},
		},
	}

	result := expandManifest(manifest)
	fields := result.Schemas[0].Fields
	if len(fields) != 2 {
		t.Fatalf("expected 2 fields, got %d", len(fields))
	}
	if fields[0].Name != "title" {
		t.Errorf("expected first field to be title, got %s", fields[0].Name)
	}
	if !fields[0].Required {
		t.Error("expected overriding title field to have required=true")
	}
	if fields[1].Name != "slug" {
		t.Errorf("expected second field to be slug, got %s", fields[1].Name)
	}
}

func TestExpandManifest_UnknownSupersetSkipped(t *testing.T) {
	manifest := Manifest{
		Namespace: "test",
		Schemas: []ManifestSchema{
			{
				Name:    "post",
				Type:    "collection",
				Fields:  []ManifestField{{Name: "body", Type: "string"}},
				Extends: []string{"nonexistent"},
			},
		},
	}

	result := expandManifest(manifest)
	fields := result.Schemas[0].Fields
	if len(fields) != 1 || fields[0].Name != "body" {
		t.Errorf("expected only own fields to remain, got %v", fields)
	}
}

func TestExpandManifest_BuiltinPageSuperset(t *testing.T) {
	manifest := Manifest{
		Namespace: "test",
		Schemas: []ManifestSchema{
			{
				Name:    "blog_post",
				Type:    "collection",
				Fields:  []ManifestField{{Name: "author", Type: "string"}},
				Extends: []string{"page"},
			},
		},
	}

	result := expandManifest(manifest)
	fields := result.Schemas[0].Fields

	names := make([]string, len(fields))
	for i, f := range fields {
		names[i] = f.Name
	}

	required := map[string]bool{"title": false, "body": false, "meta_description": false, "cover_image": false, "author": false}
	for _, n := range names {
		required[n] = true
	}
	for name, found := range required {
		if !found {
			t.Errorf("expected field %q to be present after page superset expansion", name)
		}
	}
	if names[len(names)-1] != "author" {
		t.Errorf("expected own field author to come last, got %v", names)
	}
}

func TestExpandManifest_UserSupersetOverridesBuiltin(t *testing.T) {
	manifest := Manifest{
		Namespace: "test",
		Supersets: []ManifestSuperset{
			{Name: "page", Fields: []ManifestField{
				{Name: "custom_title", Type: "string", Required: true},
			}},
		},
		Schemas: []ManifestSchema{
			{
				Name:    "blog_post",
				Type:    "collection",
				Fields:  []ManifestField{},
				Extends: []string{"page"},
			},
		},
	}

	result := expandManifest(manifest)
	fields := result.Schemas[0].Fields
	if len(fields) != 1 || fields[0].Name != "custom_title" {
		t.Errorf("expected only custom_title, got %v", fields)
	}
}

func TestExpandManifest_ExtendsCleared(t *testing.T) {
	manifest := Manifest{
		Namespace: "test",
		Supersets: []ManifestSuperset{
			{Name: "base", Fields: []ManifestField{{Name: "title", Type: "string"}}},
		},
		Schemas: []ManifestSchema{
			{
				Name:    "post",
				Type:    "collection",
				Fields:  []ManifestField{},
				Extends: []string{"base"},
			},
		},
	}

	result := expandManifest(manifest)
	if len(result.Schemas[0].Extends) != 0 {
		t.Errorf("expected Extends to be cleared, got %v", result.Schemas[0].Extends)
	}
}
