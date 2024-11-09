type ValidationTargetKeys = 'text' | 'json' | 'body' | 'headers' | 'cookie'

const textRegex = /^text\/plain(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/
const jsonRegex = /^application\/([a-z-\.]+\+)?json(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/
