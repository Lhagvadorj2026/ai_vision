import Foundation
import CoreML
import Vision
import ImageIO

// Also compiled by the macOS smoke test; inference never calls a remote API.
final class ObjectDetector {
  private let model: VNCoreMLModel

  init(modelURL: URL) throws {
    let url = modelURL.pathExtension == "mlmodelc" ? modelURL : try MLModel.compileModel(at: modelURL)
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    model = try VNCoreMLModel(for: MLModel(contentsOf: url, configuration: configuration))
  }

  func detect(jpeg: Data) throws -> [[String: Any]] {
    guard jpeg.count <= 512_000,
          let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
      throw NSError(domain: "AiVision", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid camera JPEG"])
    }
    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .scaleFit
    try VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])
    guard let results = request.results as? [VNRecognizedObjectObservation] else {
      throw NSError(domain: "AiVision", code: 2, userInfo: [NSLocalizedDescriptionKey: "Model did not return object detections"])
    }
    return results.compactMap { observation in
      guard let label = observation.labels.first, label.confidence >= 0.55 else { return nil }
      let box = observation.boundingBox
      return [
        "label": label.identifier,
        "confidence": Double(label.confidence),
        "x": Double(box.minX), "y": Double(1 - box.maxY),
        "width": Double(box.width), "height": Double(box.height)
      ] as [String: Any]
    }
  }
}
