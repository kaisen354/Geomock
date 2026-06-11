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
// OPENROUTER_API_KEY environment variable. Fatals if the key is absent.
func NewOverseerAgent() *OverseerAgent {
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		log.Fatal("[Overseer] OPENROUTER_API_KEY environment variable is not set — aborting startup")
	}

	config := openai.DefaultConfig(apiKey)
	config.BaseURL = "https://openrouter.ai/api/v1"

	client := openai.NewClientWithConfig(config)

	log.Println("[Overseer] OpenRouter AI agent initialized successfully")
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

After calling the function, respond with a short, confident status message in the style of a
military operations center (e.g. "Deploying 500 agents to London sector. Tick rate set to 200ms.").

If the operator asks a question that does not require changing the simulation, answer it directly
without calling any function.

Default tick rate if unspecified: 500ms. Default agent count if unspecified: 100.`

// ─────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────

// Chat sends userText to the model and returns the result.
func (o *OverseerAgent) Chat(ctx context.Context, userText string) (ChatResult, error) {
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

	resp, err := o.client.CreateChatCompletion(ctx, req)
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
