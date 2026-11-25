/**
 * Built-in AI: settings, commit message suggestions, explaining a commit,
 * and conflict help. Fake AI services (fake-server.ts) answer instead of
 * real ones, for both the Anthropic and the OpenAI-style provider.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { ServerResponse } from 'node:http'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'
import { pieces, sendEvents, startFakeServer, type FakeRequest } from './fake-server'

test.afterAll(cleanupTempDirs)

/** The answer the fake service gives, chosen from the system prompt. */
function answerFor(system: string): string {
  if (system.includes('commit messages')) return 'Add greeting\n\nSo visitors feel welcome.'
  if (system.includes('explain git commits')) return 'This commit adds a greeting to the README.'
  if (system.includes('merge conflicts')) {
    return 'Both sides edited the second line; I kept both.\n\n```resolved\n# test\nfrom main\nfrom other\n```\n'
  }
  return 'Connected.'
}

/** An OpenAI-style chat completions endpoint that streams its answer. */
function openAiHandler(request: FakeRequest, response: ServerResponse) {
  const body = request.body as { messages: { role: string; content: string }[] }
  const system = body.messages.find((m) => m.role === 'system')?.content ?? ''
  sendEvents(response, [
    ...pieces(answerFor(system)).map((text) => ({
      data: { choices: [{ delta: { content: text } }] },
    })),
    { data: '[DONE]' },
  ])
}

/** The Anthropic Messages API's streaming format. */
function anthropicHandler(request: FakeRequest, response: ServerResponse) {
  const body = request.body as { system: string; model: string }
  sendEvents(response, [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    },
    {
      event: 'content_block_start',
      data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    },
    ...pieces(answerFor(body.system)).map((text) => ({
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    })),
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 12 },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ])
}

/** Start Trellis with AI already set up to use `baseUrl`. */
async function launchWithAi(provider: 'anthropic' | 'openai', baseUrl: string) {
  const userData = tempDir()
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      ai: { enabled: true, provider, model: provider === 'openai' ? 'test-model' : '', baseUrl },
    }),
  )
  return { ...(await launch(userData)), userData }
}

async function openAiSettings(window: Page) {
  await window.keyboard.press('ControlOrMeta+,')
  await window.getByRole('tab', { name: 'AI' }).click()
  return window.getByTestId('ai-settings')
}

test('AI buttons only appear once AI is turned on in Settings', async () => {
  const repo = createRepo()
  repo.write('README.md', '# changed\n')
  repo.git('add', '.')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  await expect(window.getByRole('button', { name: 'Suggest' })).toBeHidden()

  const settings = await openAiSettings(window)
  await settings.getByLabel('Turn on AI features').check()
  await window.keyboard.press('Escape')
  await expect(window.getByRole('button', { name: 'Suggest' })).toBeVisible()
  await app.close()
})

test('Anthropic: saves the key, tests the connection and suggests a commit message', async () => {
  const server = await startFakeServer(anthropicHandler)
  const repo = createRepo()
  repo.write('README.md', '# test\nHello!\n')
  repo.git('add', '.')
  const { app, window, userData } = await launchWithAi('anthropic', server.url)
  await openRepo(app, window, repo.path)

  // Save a key; it is stored encrypted and never shown again.
  const settings = await openAiSettings(window)
  await settings.getByLabel('API key').fill('sk-ant-test')
  await settings.getByRole('button', { name: 'Save' }).click()
  await expect(settings.getByLabel('API key')).toHaveAttribute('placeholder', /saved/)
  await settings.getByRole('button', { name: 'Test connection' }).click()
  await expect(settings.getByRole('status')).toHaveText('Connected.')
  await window.keyboard.press('Escape')

  await window.getByRole('tab', { name: /Changes/ }).click()
  await window.getByRole('button', { name: 'Suggest' }).click()
  await expect(window.getByLabel('Commit summary')).toHaveValue('Add greeting')
  await expect(window.getByLabel('Commit description')).toHaveValue('So visitors feel welcome.')

  const request = server.requests.at(-1)!
  expect(request.headers.authorization).toBe('Bearer sk-ant-test')
  const body = request.body as { model: string; messages: { content: string }[] }
  expect(body.model).toBe('claude-opus-5-5') // the default
  expect(body.messages[0]!.content).toContain('+Hello!') // the staged diff
  // The key is saved, but only in encrypted form.
  const secrets = readFileSync(join(userData, 'secrets.json'), 'utf8')
  expect(secrets).toContain('ai.apiKey')
  expect(secrets).not.toContain('sk-ant-test')
  await app.close()
  await server.close()
})

test('OpenAI-style: explains a commit and resolves a conflict', async () => {
  const server = await startFakeServer(openAiHandler)
  const repo = createRepo()
  repo.git('switch', '-c', 'other')
  repo.write('README.md', '# test\nfrom other\n')
  repo.commit('other changes')
  repo.git('switch', 'main')
  repo.write('README.md', '# test\nfrom main\n')
  repo.commit('main changes')
  try {
    repo.git('merge', 'other')
  } catch {
    // Expected: the merge stops with a conflict.
  }
  const { app, window } = await launchWithAi('openai', `${server.url}/v1`)
  await openRepo(app, window, repo.path)

  // Explain a commit from its right-click menu.
  await window.getByRole('tab', { name: /History/ }).click()
  await window
    .getByTestId('commit-row')
    .filter({ hasText: 'main changes' })
    .click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Explain with AI' }).click()
  const dialog = window.getByTestId('ai-dialog')
  await expect(dialog.getByTestId('ai-answer')).toHaveText(
    'This commit adds a greeting to the README.',
  )
  await dialog.getByRole('button', { name: 'Done' }).click()

  // Ask AI about the conflict and use its resolution.
  await window
    .getByTestId('operation-banner')
    .getByRole('button', { name: 'Show conflicts' })
    .click()
  const conflicts = window.getByRole('region', { name: 'Conflicts', exact: true })
  await conflicts.getByRole('button', { name: /README\.md/ }).click()
  await window.getByTestId('conflict-editor').getByRole('button', { name: 'Ask AI' }).click()
  await expect(dialog.getByTestId('ai-answer')).toHaveText(
    'Both sides edited the second line; I kept both.',
  )
  await expect(dialog).toContainText('from main\nfrom other')
  await dialog.getByRole('button', { name: 'Use this resolution' }).click()
  await expect(window.getByTestId('operation-banner')).toContainText('All conflicts are resolved')
  expect(readFileSync(join(repo.path, 'README.md'), 'utf8')).toBe('# test\nfrom main\nfrom other\n')

  const request = server.requests.at(-1)!
  expect(request.url).toBe('/v1/chat/completions')
  expect(request.headers.authorization).toBeUndefined() // no key saved: none sent
  expect((request.body as { model: string }).model).toBe('test-model')
  await app.close()
  await server.close()
})
