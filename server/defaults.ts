import type { Settings } from '../shared/types.js';

export const DEFAULT_SETTINGS: Settings = {
  channel: {
    name: 'My Channel',
    handle: '@mychannel',
    niche: 'AI tools & creator systems',
    audience: 'solo creators and small teams building a channel on systems, not luck',
    language: 'English',
    timezone: 'Asia/Karachi',
  },
  brand: {
    voice: 'Calm authority. Short sentences. No hype, no income screenshots.',
    tone: 'Analytical',
    palette: ['#6D5DF6', '#22D3EE', '#F5B544'],
    keywords: ['systems', 'retention', 'sequencing', 'compounding'],
    bannedWords: ['guaranteed', 'get rich', 'hack'],
  },
  research: {
    youtubeApiKey: '',
    region: 'US',
    language: 'en',
    resultLimit: 25,
  },
  providers: [
    { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', apiKey: '', enabled: true, kind: 'text' },
    { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', enabled: false, kind: 'text' },
    { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet', apiKey: '', enabled: false, kind: 'text' },
    { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '', enabled: false, kind: 'text' },
    { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest', apiKey: '', enabled: false, kind: 'text' },
  ],
  media: {
    imageProvider: 'auto',
    ttsProvider: 'auto',
    geminiApiKey: '',
    geminiImageModel: 'gemini-2.5-flash-image',
    geminiTtsModel: 'gemini-2.5-flash-preview-tts',
    geminiVoice: 'Kore',
    openaiApiKey: '',
    openaiImageModel: 'gpt-image-1',
    openaiTtsModel: 'gpt-4o-mini-tts',
    openaiVoice: 'alloy',
    elevenLabsApiKey: '',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    defaultAspect: '16:9',
    motion: true,
  },
};
