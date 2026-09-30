import { CONTEXT_DELAY_MS, createContextFixture } from './contextFixture'
import { presentSuggestion, type AssistSource } from './assist'

export const demoAssistSource: AssistSource = {
  watch({ signal, onSnapshot }) {
    if (signal.aborted) return
    const timer = window.setTimeout(() => {
      const context = createContextFixture()
      onSnapshot({ context, suggestion: presentSuggestion({
        serviceId: 'car-loan', name: 'Car loan', category: 'loans', path: '/car-loan',
        type: 'loan', requiresAuthentication: false, reason: 'See your borrowing options for a new or used car.',
      }, context) })
    }, CONTEXT_DELAY_MS)
    signal.addEventListener('abort', () => window.clearTimeout(timer), { once: true })
  },
  async pause() {},
  async deleteContext() {},
}
