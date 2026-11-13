import ExpoModulesCore
import Foundation

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask,
                  willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest,
                  completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}

public final class AiVisionModule: Module {
  private let queue = DispatchQueue(label: "ai-vision.inference", qos: .userInitiated)
  private var detector: ObjectDetector?
  private let redirectDelegate = NoRedirects()
  private let mongolianAudio = MongolianAudioPlayer()

  public func definition() -> ModuleDefinition {
    Name("AiVision")
    OnCreate {
      NSLog("[AiVision] native module registered: offline-mn-proximity-2")
    }
    AsyncFunction("speakMongolian") { (clips: [String]) -> Double in
      try self.mongolianAudio.play(clips)
    }.runOnQueue(.main)
    AsyncFunction("stopMongolian") {
      self.mongolianAudio.stop()
    }.runOnQueue(.main)
    AsyncFunction("detect") { (address: String, promise: Promise) in
      self.queue.async {
        do {
          guard let url = URL(string: address), url.scheme == "http",
                url.user == nil, url.password == nil,
                let host = url.host, self.isLocal(host), url.port == 81, url.path == "/capture" else {
            throw self.error("Only local ESP32 camera snapshots are accepted")
          }
          if self.detector == nil {
            let bundles = [Bundle(for: AiVisionModule.self), Bundle.main]
            let modelURL = bundles.compactMap { $0.url(forResource: "AiVisionModels", withExtension: "bundle") }
              .compactMap { Bundle(url: $0)?.url(forResource: "YOLOv3TinyInt8LUT", withExtension: "mlmodelc") }.first
            guard let modelURL else { throw self.error("Bundled AI model missing; rebuild the iPhone app") }
            self.detector = try ObjectDetector(modelURL: modelURL)
          }
          let jpeg = try self.snapshot(url)
          let started = Date()
          let objects = try self.detector!.detect(jpeg: jpeg)
          promise.resolve(["objects": objects, "inferenceMs": Date().timeIntervalSince(started) * 1000])
        } catch {
          promise.reject("ERR_AI_VISION", error.localizedDescription)
        }
      }
    }
  }

  private func isLocal(_ host: String) -> Bool {
    let components = host.split(separator: ".", omittingEmptySubsequences: false)
    guard components.count == 4 else { return false }
    let parts = components.compactMap { Int($0) }
    guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }) else { return false }
    return parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) ||
      (parts[0] == 172 && (16...31).contains(parts[1]))
  }

  private func snapshot(_ url: URL) throws -> Data {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 2
    configuration.timeoutIntervalForResource = 2
    let session = URLSession(configuration: configuration, delegate: redirectDelegate, delegateQueue: nil)
    defer { session.invalidateAndCancel() }
    let semaphore = DispatchSemaphore(value: 0)
    var result: Result<Data, Error> = .failure(error("Camera request timed out"))
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    request.setValue("image/jpeg", forHTTPHeaderField: "Accept")
    let task = session.dataTask(with: request) { data, response, failure in
      defer { semaphore.signal() }
      if let failure { result = .failure(failure); return }
      guard let http = response as? HTTPURLResponse, http.statusCode == 200,
            http.mimeType == "image/jpeg", let data, !data.isEmpty, data.count <= 512_000 else {
        result = .failure(self.error("Camera snapshot unavailable; check firmware and Wi-Fi")); return
      }
      result = .success(data)
    }
    task.resume()
    guard semaphore.wait(timeout: .now() + 3) == .success else {
      task.cancel()
      throw error("Camera snapshot timed out")
    }
    return try result.get()
  }

  private func error(_ message: String) -> NSError {
    NSError(domain: "AiVision", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
