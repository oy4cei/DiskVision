import AppKit

func convertToAppStoreDimensions(inputPath: String, outputPath: String) {
    guard let srcImage = NSImage(contentsOfFile: inputPath),
          let cgImage = srcImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("Failed to load image:", inputPath)
        return
    }
    
    // Exact Apple Mac App Store requirement: 2880 x 1800
    let targetWidth: CGFloat = 2880
    let targetHeight: CGFloat = 1800
    let canvasSize = NSSize(width: targetWidth, height: targetHeight)
    
    let canvas = NSImage(size: canvasSize)
    canvas.lockFocus()
    
    guard let ctx = NSGraphicsContext.current?.cgContext else { return }
    
    // Fill dark background (#090a0f)
    ctx.setFillColor(CGColor(red: 9.0/255.0, green: 10.0/255.0, blue: 15.0/255.0, alpha: 1.0))
    ctx.fill(CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
    
    // Scale image to fill/fit 2880 x 1800 while maintaining aspect ratio or centered frame
    let srcW = CGFloat(cgImage.width)
    let srcH = CGFloat(cgImage.height)
    let aspectSrc = srcW / srcH
    let aspectTarget = targetWidth / targetHeight
    
    var drawRect: CGRect
    if aspectSrc > aspectTarget {
        let drawH = targetWidth / aspectSrc
        let drawY = (targetHeight - drawH) / 2
        drawRect = CGRect(x: 0, y: drawY, width: targetWidth, height: drawH)
    } else {
        let drawW = targetHeight * aspectSrc
        let drawX = (targetWidth - drawW) / 2
        drawRect = CGRect(x: drawX, y: 0, width: drawW, height: targetHeight)
    }
    
    ctx.interpolationQuality = .high
    ctx.draw(cgImage, in: drawRect)
    
    canvas.unlockFocus()
    
    if let tiff = canvas.tiffRepresentation,
       let bitmap = NSBitmapImageRep(data: tiff),
       let pngData = bitmap.representation(using: .png, properties: [:]) {
        try? pngData.write(to: URL(fileURLWithPath: outputPath))
        print("Successfully generated App Store screenshot (2880x1800):", outputPath)
    }
}

let args = CommandLine.arguments
if args.count >= 3 {
    convertToAppStoreDimensions(inputPath: args[1], outputPath: args[2])
}
