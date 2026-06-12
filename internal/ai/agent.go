package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/sashabaranov/go-openai"
	"github.com/sashabaranov/go-openai/jsonschema"
)

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

type BoundingEnvelope struct {
	MinLat float64 `json:"minLat"`
	MaxLat float64 `json:"maxLat"`
	MinLng float64 `json:"minLng"`
	MaxLng float64 `json:"maxLng"`
}

type ControlArgs struct {
	AgentCount   int               `json:"agentCount"`
	TickRateMs   int               `json:"tickRateMs"`
	TargetCity   string            `json:"targetCity,omitempty"`
	TargetBounds *BoundingEnvelope `json:"targetBounds,omitempty"`
	// Phase 5: A* routing target coordinates (optional)
	TargetLat float64 `json:"targetLat,omitempty"`
	TargetLng float64 `json:"targetLng,omitempty"`
}

// ChatResult is the value returned by OverseerAgent.Chat.
// Exactly one of Call or Reply will be non-zero.
//   - If the model chose to invoke the tool: Call is set, Reply may still hold
//     a confirmation sentence if the model returned one after the function call.
//   - If the model answered in plain text: only Reply is set.
type ChatResult struct {
	Reply string
	Call  *ControlArgs
}

// ─────────────────────────────────────────────────────────────
// OverseerAgent
// ─────────────────────────────────────────────────────────────

// OverseerAgent wraps an API client configured with
// the control_simulation function-calling tool.
type OverseerAgent struct {
	client *openai.Client
	model  string
}

// NewOverseerAgent constructs an OverseerAgent using the
// OPENROUTER_API_KEY environment variable. If absent, it logs a warning.
func NewOverseerAgent() *OverseerAgent {
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	var client *openai.Client
	
	if apiKey == "" {
		log.Println("[Overseer] Warning: OPENROUTER_API_KEY environment variable is not set. A dynamic key must be provided in requests.")
	} else {
		config := openai.DefaultConfig(apiKey)
		config.BaseURL = "https://openrouter.ai/api/v1"
		client = openai.NewClientWithConfig(config)
		log.Println("[Overseer] OpenRouter AI agent initialized successfully with environment key")
	}

	return &OverseerAgent{
		client: client,
		model:  "google/gemini-2.5-flash",
	}
}

// ─────────────────────────────────────────────────────────────
// Tool definition
// ─────────────────────────────────────────────────────────────

// controlSimulationTool returns the Tool for
// the control_simulation tool. Built once per Chat call.
func controlSimulationTool() openai.Tool {
	return openai.Tool{
		Type: openai.ToolTypeFunction,
		Function: &openai.FunctionDefinition{
			Name:        "control_simulation",
			Description: "Modify the live GeoMock simulation parameters. Use this when the user wants to change the number of agents, the tick rate, or teleport agents to a named city.",
			Parameters: jsonschema.Definition{
				Type: jsonschema.Object,
				Properties: map[string]jsonschema.Definition{
					"agentCount": {
						Type:        jsonschema.Integer,
						Description: "Number of driver agents to spawn in the simulation. Must be between 1 and 5000.",
					},
					"tickRateMs": {
						Type:        jsonschema.Integer,
						Description: "Simulation tick interval in milliseconds. Lower = faster. Typical range: 100–2000.",
					},
					"targetCity": {
						Type:        jsonschema.String,
						Description: "Optional. A city name to teleport agents to. Can be any city in the world.",
					},
					"targetBounds": {
						Type:        jsonschema.Object,
						Description: "Optional. If a targetCity is specified, you MUST provide its approximate geographic bounding box coordinates.",
						Properties: map[string]jsonschema.Definition{
							"minLat": {Type: jsonschema.Number},
							"maxLat": {Type: jsonschema.Number},
							"minLng": {Type: jsonschema.Number},
							"maxLng": {Type: jsonschema.Number},
						},
						Required: []string{"minLat", "maxLat", "minLng", "maxLng"},
					},
					"targetLat": {
						Type:        jsonschema.Number,
						Description: "Optional. Latitude of a specific destination landmark or point of interest. Populate this (along with targetLng) when the user asks agents to navigate TO a specific location using road routing. Example: 51.5007 for the Houses of Parliament.",
					},
					"targetLng": {
						Type:        jsonschema.Number,
						Description: "Optional. Longitude of the dispatch destination. Must accompany targetLat.",
					},
				},
				Required: []string{"agentCount", "tickRateMs"},
			},
		},
	}
}

// ─────────────────────────────────────────────────────────────
// System instruction
// ─────────────────────────────────────────────────────────────

const systemInstruction = `You are the Overseer — an AI control agent for the GeoMock geospatial
simulation platform. Your role is to interpret natural language commands from the operator and
translate them into precise simulation control actions.

When the operator asks you to change the number of agents, deploy to a city, adjust speed/tick
rate, or run a stress test, you MUST call the control_simulation function with the appropriate
parameters. Do not ask for confirmation — execute immediately.

If the operator asks to deploy to a specific city, you must provide BOTH targetCity and targetBounds (the approximate latitude and longitude bounding box of that city). You support ANY city in the world.

If the operator references a specific destination landmark or point of interest (e.g. "send agents
to the Golden Gate Bridge", "route 200 agents to Big Ben", "deploy to the Eiffel Tower"), you MUST
resolve its precise coordinates and populate BOTH targetLat and targetLng in your
control_simulation call. The backend will compute A* shortest-path routes from each agent's
current position to that exact point on the loaded road network. This is more precise than a
city-level teleport — use it whenever a specific destination is mentioned.

After calling the function, respond with a short, confident status message in the style of a
military operations center (e.g. "Deploying 500 agents to London sector. Tick rate set to 200ms.").

If the operator asks a question that does not require changing the simulation, answer it directly
without calling any function.

Default tick rate if unspecified: 500ms. Default agent count if unspecified: 100.`

// ─────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────

// Chat sends userText to the model and returns the result.
func (o *OverseerAgent) Chat(ctx context.Context, userText string, dynamicApiKey string) (ChatResult, error) {
	client := o.client
	if dynamicApiKey != "" {
		config := openai.DefaultConfig(dynamicApiKey)
		config.BaseURL = "https://openrouter.ai/api/v1"
		client = openai.NewClientWithConfig(config)
	}
	if client == nil {
		return ChatResult{}, fmt.Errorf("no openrouter api key configured (neither environment nor dynamic)")
	}

	req := openai.ChatCompletionRequest{
		Model: o.model,
		MaxTokens: 1000,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: systemInstruction,
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: userText,
			},
		},
		Tools: []openai.Tool{controlSimulationTool()},
	}

	resp, err := client.CreateChatCompletion(ctx, req)
	if err != nil {
		return ChatResult{}, fmt.Errorf("openrouter generate: %w", err)
	}

	return parseResponse(resp)
}

// ─────────────────────────────────────────────────────────────
// Response parsing
// ─────────────────────────────────────────────────────────────

func parseResponse(resp openai.ChatCompletionResponse) (ChatResult, error) {
	var result ChatResult

	if len(resp.Choices) == 0 {
		return result, fmt.Errorf("empty response from API")
	}

	msg := resp.Choices[0].Message

	// Text reply
	if msg.Content != "" {
		result.Reply += msg.Content
	}

	// Function call
	if len(msg.ToolCalls) > 0 {
		for _, toolCall := range msg.ToolCalls {
			if toolCall.Function.Name == "control_simulation" {
				args, err := unmarshalJSONControlArgs(toolCall.Function.Arguments)
				if err != nil {
					return result, fmt.Errorf("parse control_simulation args: %w", err)
				}
				result.Call = &args
				break
			}
		}
	}

	return result, nil
}

func unmarshalJSONControlArgs(raw string) (ControlArgs, error) {
	var args ControlArgs

	if err := json.Unmarshal([]byte(raw), &args); err != nil {
		return args, err
	}

	// Apply safe defaults if the model omitted optional fields
	if args.AgentCount <= 0 {
		args.AgentCount = 100
	}
	if args.TickRateMs <= 0 {
		args.TickRateMs = 500
	}

	return args, nil
}

// ─────────────────────────────────────────────────────────────
// Diagnostics Expert
// ─────────────────────────────────────────────────────────────

const diagnosticsInstruction = `You are a GEOMOCK API performance optimization expert.
You help engineers diagnose load testing issues based on live telemetry data.
You will be given the user's question along with the current metrics (RPS, failures, latency) and the state of pipeline nodes.
Reference the specific nodes provided (e.g., "Ingestion Chan", "WebSocket Hub", "Redis Stream") and give concrete, actionable optimization suggestions (e.g., connection pooling, rate limiting, caching strategies, async queue tuning, horizontal scaling, circuit breakers).
Keep your responses concise and highly technical. Use the same vocabulary as the dashboard.
Where relevant, suggest which graph or node to look at to verify the issue.`

// ChatDiagnostics sends a diagnostics question to the model with live context.
// No tools are used here, just text-in, text-out.
func (o *OverseerAgent) ChatDiagnostics(ctx context.Context, contextPayload string, userQuestion string, dynamicApiKey string) (string, error) {
	client := o.client
	if dynamicApiKey != "" {
		config := openai.DefaultConfig(dynamicApiKey)
		config.BaseURL = "https://openrouter.ai/api/v1"
		client = openai.NewClientWithConfig(config)
	}
	if client == nil {
		return "", fmt.Errorf("no openrouter api key configured (neither environment nor dynamic)")
	}

	prompt := fmt.Sprintf("Live Context:\n%s\n\nUser Question:\n%s", contextPayload, userQuestion)
	req := openai.ChatCompletionRequest{
		Model: o.model,
		MaxTokens: 1500,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: diagnosticsInstruction,
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: prompt,
			},
		},
	}

	resp, err := client.CreateChatCompletion(ctx, req)
	if err != nil {
		return "", fmt.Errorf("openrouter generate diagnostics: %w", err)
	}

	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("empty response from API")
	}

	return resp.Choices[0].Message.Content, nil
}
