import Foundation
import AVFoundation

final class MongolianAudioPlayer: NSObject, AVAudioPlayerDelegate {
  private var pending: [AVAudioPlayer] = []
  private var current: AVAudioPlayer?

  // Invoked on main by the Expo module. Validate the entire sequence first.
  func play(_ clips: [String]) throws -> Double {
    guard !clips.isEmpty, clips.count <= 5 else { throw audioError("Invalid warning sequence") }
    let containers = [Bundle(for: MongolianAudioPlayer.self), Bundle.main]
    guard let bundle = containers.compactMap({ $0.url(forResource: "AiVisionAudio", withExtension: "bundle") })
      .compactMap({ Bundle(url: $0) }).first else { throw audioError("Mongolian audio bundle missing") }
    let players = try clips.map { clip -> AVAudioPlayer in
      guard clip.range(of: "^[a-z0-9_]+$", options: .regularExpression) != nil,
            let url = bundle.url(forResource: clip, withExtension: "m4a") else {
        throw audioError("Mongolian warning clip missing: \(clip)")
      }
      let player = try AVAudioPlayer(contentsOf: url)
      player.prepareToPlay()
      return player
    }
    stop()
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    try session.setActive(true)
    let duration = players.reduce(0) { $0 + $1.duration }
    pending = players
    try playNext()
    return duration
  }

  func stop() {
    current?.stop()
    current = nil
    pending.removeAll()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func playNext() throws {
    guard !pending.isEmpty else { stop(); return }
    current = pending.removeFirst()
    current?.delegate = self
    guard current?.play() == true else { stop(); throw audioError("Unable to play Mongolian warning") }
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    if flag { try? playNext() } else { stop() }
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) { stop() }

  private func audioError(_ message: String) -> NSError {
    NSError(domain: "MongolianAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
