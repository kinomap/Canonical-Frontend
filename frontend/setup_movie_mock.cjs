const fs = require('fs')

function updateMock(file) {
  let content = fs.readFileSync(file, 'utf8')
  content = content.replace(/getAudioTracks: vi.fn\(\)/g, "getAudioTracks: vi.fn(),\n  getComments: vi.fn(),\n  getReactions: vi.fn()")
  content = content.replace(/getAudioTracks: vi\.fn\(\)\.mockResolvedValue\(\[\]\)/g, "getAudioTracks: vi.fn().mockResolvedValue([]),\n    getComments: vi.fn().mockResolvedValue([]),\n    getReactions: vi.fn().mockResolvedValue([])")
  content = content.replace(/\.play-btn/g, ".player-container")
  fs.writeFileSync(file, content)
}

updateMock('src/tests/MovieDetailsView.spec.ts')
updateMock('src/tests/MovieDetailsView.spec.js')
