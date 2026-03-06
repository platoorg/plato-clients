// plato-codegen generates an idiomatic Go client from a plato-manifest.json file.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

// Manifest represents the top-level plato-manifest.json structure.
type Manifest struct {
	Namespace string           `json:"namespace"`
	Public    bool             `json:"public"`
	Schemas   []ManifestSchema `json:"schemas"`
}

// ManifestSchema represents a single schema entry (singleton or collection).
type ManifestSchema struct {
	Name   string          `json:"name"`
	Type   string          `json:"type"` // "singleton" | "collection"
	Fields []ManifestField `json:"fields"`
}

// ManifestField represents a single field within a schema.
type ManifestField struct {
	Name     string `json:"name"`
	Type     string `json:"type"`     // string | number | boolean | date | media | relation_one | relation_many
	Required bool   `json:"required"` // omitted = false
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

// toPascalCase converts a snake_case or kebab-case identifier to PascalCase.
// Examples: "hero_title" -> "HeroTitle", "demo-counter" -> "DemoCounter"
func toPascalCase(s string) string {
	parts := strings.FieldsFunc(s, func(r rune) bool {
		return r == '_' || r == '-'
	})
	var b strings.Builder
	for _, p := range parts {
		if len(p) == 0 {
			continue
		}
		b.WriteString(strings.ToUpper(p[:1]))
		b.WriteString(p[1:])
	}
	return b.String()
}

// toGoType maps a Plato field type + required flag to the corresponding Go type string.
func toGoType(fieldType string, required bool) string {
	switch fieldType {
	case "string":
		if required {
			return "string"
		}
		return "*string"
	case "number":
		if required {
			return "float64"
		}
		return "*float64"
	case "boolean":
		if required {
			return "bool"
		}
		return "*bool"
	case "date":
		if required {
			return "string"
		}
		return "*string"
	case "media":
		if required {
			return "string"
		}
		return "*string"
	case "relation_one":
		if required {
			return "string"
		}
		return "*string"
	case "relation_many":
		// Slices are never pointer types regardless of required.
		return "[]string"
	default:
		if required {
			return "string"
		}
		return "*string"
	}
}

// toGoComment returns an inline comment for certain field types, or empty string.
func toGoComment(fieldType string) string {
	switch fieldType {
	case "date":
		return " // ISO 8601"
	case "media":
		return " // media asset URL"
	case "relation_one":
		return " // ID of related item"
	case "relation_many":
		return " // IDs of related items"
	default:
		return ""
	}
}

// jsonTag builds a json struct tag. Appends ,omitempty for optional (non-required,
// non-slice) fields.
func jsonTag(fieldName string, fieldType string, required bool) string {
	if !required && fieldType != "relation_many" {
		return fmt.Sprintf(`json:"%s,omitempty"`, fieldName)
	}
	return fmt.Sprintf(`json:"%s"`, fieldName)
}

// apiSlug converts a schema name to its API path segment.
// Underscores are replaced with hyphens: "demo_counter" -> "demo-counter".
func apiSlug(name string) string {
	return strings.ReplaceAll(name, "_", "-")
}

// maxFieldNameLen returns the length of the longest PascalCase field name in the
// field list, used for struct alignment padding.
func maxFieldNameLen(fields []ManifestField) int {
	max := 0
	for _, f := range fields {
		n := len(toPascalCase(f.Name))
		if n > max {
			max = n
		}
	}
	return max
}

// maxFieldTypeLen returns the length of the longest Go type string in the field
// list, used for struct alignment padding.
func maxFieldTypeLen(fields []ManifestField) int {
	max := 0
	for _, f := range fields {
		n := len(toGoType(f.Type, f.Required))
		if n > max {
			max = n
		}
	}
	return max
}

// ---------------------------------------------------------------------------
// Code generator
// ---------------------------------------------------------------------------

// generate produces the full content of the generated Go client file as a string.
func generate(manifest Manifest) string {
	var b strings.Builder

	// line writes a formatted line to b via fmt.Fprintf.
	// NOTE: Do NOT pass raw Go source code containing "%" characters through
	// line(); use b.WriteString() for those sections to avoid misinterpretation
	// of format verbs.
	line := func(format string, args ...any) {
		fmt.Fprintf(&b, format, args...)
	}

	// raw writes a literal string to b with no format interpretation.
	raw := func(s string) {
		b.WriteString(s)
	}

	// -----------------------------------------------------------------------
	// File header + package + imports
	// -----------------------------------------------------------------------
	raw("// Code generated by plato-codegen — do not edit.\n\n")
	raw("package plato\n\n")
	raw("import (\n")
	raw("\t\"encoding/json\"\n")
	raw("\t\"fmt\"\n")
	raw("\t\"io\"\n")
	raw("\t\"net/http\"\n")
	raw("\t\"net/url\"\n")
	raw("\t\"strings\"\n")
	raw("\t\"time\"\n")
	raw(")\n\n")

	// -----------------------------------------------------------------------
	// PlatoItem base struct
	// -----------------------------------------------------------------------
	raw("// PlatoItem is embedded in every Plato content struct.\n")
	raw("type PlatoItem struct {\n")
	raw("\tID        string `json:\"id\"`\n")
	raw("\tCreatedAt string `json:\"created_at\"`\n")
	raw("\tUpdatedAt string `json:\"updated_at\"`\n")
	raw("}\n\n")

	// -----------------------------------------------------------------------
	// One struct per schema
	// -----------------------------------------------------------------------
	for _, schema := range manifest.Schemas {
		pascal := toPascalCase(schema.Name)

		if schema.Type == "singleton" {
			line("// %s is a singleton.\n", pascal)
		} else {
			line("// %s is a collection item.\n", pascal)
		}

		line("type %s struct {\n", pascal)
		raw("\tPlatoItem\n")

		nameWidth := maxFieldNameLen(schema.Fields)
		typeWidth := maxFieldTypeLen(schema.Fields)

		for _, field := range schema.Fields {
			goType := toGoType(field.Type, field.Required)
			comment := toGoComment(field.Type)
			tag := jsonTag(field.Name, field.Type, field.Required)
			fieldPascal := toPascalCase(field.Name)

			line("\t%-*s %-*s `%s`%s\n",
				nameWidth, fieldPascal,
				typeWidth, goType,
				tag,
				comment,
			)
		}

		raw("}\n\n")
	}

	// -----------------------------------------------------------------------
	// Params structs for collections
	// -----------------------------------------------------------------------
	for _, schema := range manifest.Schemas {
		if schema.Type != "collection" {
			continue
		}
		pascal := toPascalCase(schema.Name)

		line("// %sParams holds optional filter parameters for List%s.\n", pascal, pascal)
		line("type %sParams struct {\n", pascal)

		nameWidth := maxFieldNameLen(schema.Fields)
		for _, field := range schema.Fields {
			fieldPascal := toPascalCase(field.Name)
			line("\t%-*s *string\n", nameWidth, fieldPascal)
		}

		raw("}\n\n")
	}

	// -----------------------------------------------------------------------
	// PlatoClient struct + constructor
	// -----------------------------------------------------------------------
	raw("// PlatoClient communicates with a Plato REST API.\n")
	raw("type PlatoClient struct {\n")
	raw("\tbaseURL   string\n")
	raw("\tnamespace string\n")
	raw("\tapiKey    string\n")
	raw("\thttp      *http.Client\n")
	raw("}\n\n")

	raw("// NewPlatoClient creates a new PlatoClient.\n")
	raw("// Pass an empty string for apiKey if the namespace is public.\n")
	raw("func NewPlatoClient(baseURL, namespace, apiKey string) *PlatoClient {\n")
	raw("\treturn &PlatoClient{\n")
	raw("\t\tbaseURL:   strings.TrimRight(baseURL, \"/\"),\n")
	raw("\t\tnamespace: namespace,\n")
	raw("\t\tapiKey:    apiKey,\n")
	raw("\t\thttp:      &http.Client{Timeout: 30 * time.Second},\n")
	raw("\t}\n")
	raw("}\n\n")

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------
	raw("// headers returns the HTTP headers required for every request.\n")
	raw("func (c *PlatoClient) headers() map[string]string {\n")
	raw("\th := map[string]string{\n")
	raw("\t\t\"Content-Type\": \"application/json\",\n")
	raw("\t}\n")
	raw("\tif c.apiKey != \"\" {\n")
	raw("\t\th[\"Authorization\"] = \"Bearer \" + c.apiKey\n")
	raw("\t}\n")
	raw("\treturn h\n")
	raw("}\n\n")

	raw("// request executes an HTTP request and returns the raw response body.\n")
	raw("// It returns an error for any non-2xx status code.\n")
	raw("func (c *PlatoClient) request(method, path string, body any) ([]byte, error) {\n")
	raw("\tfullURL := c.baseURL + \"/api/\" + c.namespace + \"/\" + path\n")
	raw("\n")
	raw("\tvar reqBody io.Reader\n")
	raw("\tif body != nil {\n")
	raw("\t\tencoded, err := json.Marshal(body)\n")
	raw("\t\tif err != nil {\n")
	raw("\t\t\treturn nil, fmt.Errorf(\"plato: marshal request body: %w\", err)\n")
	raw("\t\t}\n")
	raw("\t\treqBody = strings.NewReader(string(encoded))\n")
	raw("\t}\n")
	raw("\n")
	raw("\treq, err := http.NewRequest(method, fullURL, reqBody)\n")
	raw("\tif err != nil {\n")
	raw("\t\treturn nil, fmt.Errorf(\"plato: build request: %w\", err)\n")
	raw("\t}\n")
	raw("\n")
	raw("\tfor k, v := range c.headers() {\n")
	raw("\t\treq.Header.Set(k, v)\n")
	raw("\t}\n")
	raw("\n")
	raw("\tresp, err := c.http.Do(req)\n")
	raw("\tif err != nil {\n")
	raw("\t\treturn nil, fmt.Errorf(\"plato: execute request: %w\", err)\n")
	raw("\t}\n")
	raw("\tdefer resp.Body.Close()\n")
	raw("\n")
	raw("\tdata, err := io.ReadAll(resp.Body)\n")
	raw("\tif err != nil {\n")
	raw("\t\treturn nil, fmt.Errorf(\"plato: read response body: %w\", err)\n")
	raw("\t}\n")
	raw("\n")
	raw("\tif resp.StatusCode < 200 || resp.StatusCode >= 300 {\n")
	raw("\t\treturn nil, fmt.Errorf(\"plato: unexpected status %d: %s\", resp.StatusCode, string(data))\n")
	raw("\t}\n")
	raw("\n")
	raw("\treturn data, nil\n")
	raw("}\n\n")

	raw("func (c *PlatoClient) get(path string) ([]byte, error) {\n")
	raw("\treturn c.request(http.MethodGet, path, nil)\n")
	raw("}\n\n")

	raw("func (c *PlatoClient) post(path string, body any) ([]byte, error) {\n")
	raw("\treturn c.request(http.MethodPost, path, body)\n")
	raw("}\n\n")

	raw("func (c *PlatoClient) put(path string, body any) ([]byte, error) {\n")
	raw("\treturn c.request(http.MethodPut, path, body)\n")
	raw("}\n\n")

	raw("func (c *PlatoClient) delete(path string) error {\n")
	raw("\t_, err := c.request(http.MethodDelete, path, nil)\n")
	raw("\treturn err\n")
	raw("}\n\n")

	// -----------------------------------------------------------------------
	// Methods per schema
	// -----------------------------------------------------------------------
	for _, schema := range manifest.Schemas {
		pascal := toPascalCase(schema.Name)
		slug := apiSlug(schema.Name)

		if schema.Type == "singleton" {
			generateSingletonMethods(&b, pascal, slug)
		} else {
			generateCollectionMethods(&b, pascal, slug, schema.Fields)
		}
	}

	return b.String()
}

// generateSingletonMethods writes Get and Update methods for a singleton schema.
func generateSingletonMethods(b *strings.Builder, pascal, slug string) {
	// raw writes literal text without format interpretation.
	raw := func(s string) { b.WriteString(s) }
	line := func(format string, args ...any) { fmt.Fprintf(b, format, args...) }

	lowerFirst := strings.ToLower(pascal[:1]) + pascal[1:]

	line("// Get%s fetches the %s singleton.\n", pascal, lowerFirst)
	line("func (c *PlatoClient) Get%s() (*%s, error) {\n", pascal, pascal)
	line("\tdata, err := c.get(\"%s\")\n", slug)
	raw("\tif err != nil {\n\t\treturn nil, err\n\t}\n")
	line("\tvar items []%s\n", pascal)
	raw("\tif err := json.Unmarshal(data, &items); err != nil {\n\t\treturn nil, err\n\t}\n")
	raw("\tif len(items) == 0 {\n\t\treturn nil, nil\n\t}\n")
	raw("\treturn &items[0], nil\n")
	raw("}\n\n")

	line("// Update%s updates the %s singleton.\n", pascal, lowerFirst)
	line("func (c *PlatoClient) Update%s(update map[string]any) (*%s, error) {\n", pascal, pascal)
	line("\titem, err := c.Get%s()\n", pascal)
	raw("\tif err != nil {\n\t\treturn nil, err\n\t}\n")
	line("\tif item == nil {\n\t\treturn nil, fmt.Errorf(\"%s singleton not found\")\n\t}\n", lowerFirst)
	line("\tdata, err := c.put(\"%s/\"+item.ID, update)\n", slug)
	raw("\tif err != nil {\n\t\treturn nil, err\n\t}\n")
	line("\tvar result %s\n", pascal)
	raw("\treturn &result, json.Unmarshal(data, &result)\n")
	raw("}\n\n")
}

// generateCollectionMethods writes List, Get, Create, Update, and Delete methods
// for a collection schema.
func generateCollectionMethods(b *strings.Builder, pascal, slug string, fields []ManifestField) {
	raw := func(s string) { b.WriteString(s) }
	line := func(format string, args ...any) { fmt.Fprintf(b, format, args...) }

	lowerFirst := strings.ToLower(pascal[:1]) + pascal[1:]

	// List
	line("// List%s returns %s items, optionally filtered.\n", pascal, lowerFirst)
	line("func (c *PlatoClient) List%s(params *%sParams) ([]%s, error) {\n", pascal, pascal, pascal)
	line("\tpath := \"%s\"\n", slug)
	raw("\tif params != nil {\n")
	raw("\t\tq := url.Values{}\n")
	for _, field := range fields {
		fieldPascal := toPascalCase(field.Name)
		line("\t\tif params.%s != nil {\n", fieldPascal)
		line("\t\t\tq.Set(\"%s\", *params.%s)\n", field.Name, fieldPascal)
		raw("\t\t}\n")
	}
	raw("\t\tif encoded := q.Encode(); encoded != \"\" {\n")
	raw("\t\t\tpath += \"?\" + encoded\n")
	raw("\t\t}\n")
	raw("\t}\n")
	raw("\tdata, err := c.get(path)\n")
	raw("\tif err != nil {\n\t\treturn nil, err\n\t}\n")
	line("\tvar items []%s\n", pascal)
	raw("\treturn items, json.Unmarshal(data, &items)\n")
	raw("}\n\n")

	// Get
	line("// Get%s fetches a single %s by ID.\n", pascal, pascal)
	line("func (c *PlatoClient) Get%s(id string) (*%s, error) {\n", pascal, pascal)
	line("\tdata, err := c.get(\"%s/\" + id)\n", slug)
	raw("\tif err != nil {\n\t\treturn nil, err\n\t}\n")
	line("\tvar item %s\n", pascal)
	raw("\treturn &item, json.Unmarshal(data, &item)\n")
	raw("}\n\n")

	// Create
	line("// Create%s creates a new %s.\n", pascal, pascal)
	line("func (c *PlatoClient) Create%s(data map[string]any) (*%s, error) {\n", pascal, pascal)
	line("\trespData, err := c.post(\"%s\", data)\n", slug)
	raw("\tif err != nil {\n\t\treturn nil, err\n\t}\n")
	line("\tvar item %s\n", pascal)
	raw("\treturn &item, json.Unmarshal(respData, &item)\n")
	raw("}\n\n")

	// Update
	line("// Update%s updates an existing %s by ID.\n", pascal, pascal)
	line("func (c *PlatoClient) Update%s(id string, data map[string]any) (*%s, error) {\n", pascal, pascal)
	line("\trespData, err := c.put(\"%s/\"+id, data)\n", slug)
	raw("\tif err != nil {\n\t\treturn nil, err\n\t}\n")
	line("\tvar item %s\n", pascal)
	raw("\treturn &item, json.Unmarshal(respData, &item)\n")
	raw("}\n\n")

	// Delete
	line("// Delete%s deletes a %s by ID.\n", pascal, pascal)
	line("func (c *PlatoClient) Delete%s(id string) error {\n", pascal)
	line("\treturn c.delete(\"%s/\" + id)\n", slug)
	raw("}\n\n")
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	args := os.Args[1:]

	manifestPath := "plato-manifest.json"
	outputPath := "plato-client.go"

	if len(args) >= 1 {
		manifestPath = args[0]
	}
	if len(args) >= 2 {
		outputPath = args[1]
	}

	// Resolve to absolute paths so error messages are unambiguous.
	absManifest, err := filepath.Abs(manifestPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "plato-codegen: resolve manifest path: %v\n", err)
		os.Exit(1)
	}
	absOutput, err := filepath.Abs(outputPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "plato-codegen: resolve output path: %v\n", err)
		os.Exit(1)
	}

	// Read manifest.
	rawBytes, err := os.ReadFile(absManifest)
	if err != nil {
		fmt.Fprintf(os.Stderr, "plato-codegen: read manifest %s: %v\n", absManifest, err)
		os.Exit(1)
	}

	var manifest Manifest
	if err := json.Unmarshal(rawBytes, &manifest); err != nil {
		fmt.Fprintf(os.Stderr, "plato-codegen: parse manifest: %v\n", err)
		os.Exit(1)
	}

	if manifest.Namespace == "" {
		fmt.Fprintln(os.Stderr, "plato-codegen: manifest missing required field: namespace")
		os.Exit(1)
	}

	// Generate client source.
	code := generate(manifest)

	// Write output file.
	if err := os.WriteFile(absOutput, []byte(code), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "plato-codegen: write output %s: %v\n", absOutput, err)
		os.Exit(1)
	}

	fmt.Printf("plato-codegen: wrote %s (%d bytes)\n", absOutput, len(code))
}
