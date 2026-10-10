/** MOCK provider for local development and tests: deterministic, no network, labelled "mock". */
import type { AssistantProvider, ModelOutput, ProviderInput, ProviderResult } from './provider.js';

export class MockAssistantProvider implements AssistantProvider {
  readonly name = 'mock' as const;
  readonly model = null;
  generate(input: ProviderInput): Promise<ProviderResult> {
    const q = input.question.toLowerCase();
    const dest = input.destinations.find((d) => q.includes(d.label.toLowerCase()));
    const doc = input.documents[0];
    const output: ModelOutput = doc
      ? {
          type: dest ? 'navigation_suggestion' : 'answer',
          answer: `${doc.title}: ${doc.body}`.slice(0, 600),
          action: dest ? { kind: 'NAVIGATE', target: dest.id } : { kind: 'NONE', target: '' },
          referenceIds: [doc.id],
        }
      : {
          type: 'unsupported',
          answer: "I don't have approved help for that yet.",
          action: { kind: 'NONE', target: '' },
          referenceIds: [],
        };
    return Promise.resolve({ ok: true, output });
  }
}
