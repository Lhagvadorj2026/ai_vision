# Bundled object detector

Model: YOLOv3TinyInt8LUT.mlmodel, downloaded from Apple's Core ML model gallery.

Source: https://developer.apple.com/machine-learning/models/#image

Download: https://ml-assets.apple.com/coreml/models/Image/ObjectDetection/YOLOv3Tiny/YOLOv3TinyInt8LUT.mlmodel

SHA-256: `cde8af2528d6eca1d1580fdd0f0147cb6613d40ba962656b5f683c65f571870e`

The original pretrained model and its metadata are preserved; this project has not trained a new model. The model is bundled into AiVisionModels.bundle and loaded through Apple Vision/Core ML. Runtime requests go only to the local ESP32 /capture endpoint; no inference server or runtime model download is used.

The model recognizes its predefined object classes. A missing detection is not evidence of a clear path. It does not determine depth, holes, steps, passability, traffic light state, or safe crossing. Image direction assumes the physical camera is mounted upright and faces forward. Ultrasonic measurements are kept separate from identified objects.

Swift module code is MIT-licensed under the app's license; the model retains its upstream terms and metadata.
