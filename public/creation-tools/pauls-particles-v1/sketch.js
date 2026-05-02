/**
 * sketch.js
 * Loads a user-chosen image from the global window.imgDataURL,
 * then applies the layering and CCapture logic.
 */

function startSketch() {
  // We'll create an instance-mode p5 sketch so we don't conflict with global variables
  new p5((p) => {

    // Put all the original logic here, but adapt to p5 instance-mode:
    let img;
    let layers = [];
    let numLayers = 11;
    let layerConfigs = [
      { rows: 60, cols: 60, mode: 'dark', speed: 0.5 },
      { rows: 70, cols: 70, mode: 'darker', speed: 0.6 },
      { rows: 80, cols: 80, mode: 'medium', speed: 0.8 },
      { rows: 90, cols: 90, mode: 'light', speed: 1.0 },
      { rows: 110, cols: 110, mode: 'bright', speed: 1.2 },
      { rows: 120, cols: 120, mode: 'brighter', speed: 1.4 },
      { rows: 125, cols: 125, mode: 'brightest', speed: 1.5 },
      { rows: 50, cols: 50, mode: 'shadow1', speed: 0.5 },
      { rows: 55, cols: 55, mode: 'shadow2', speed: 0.4 },
      { rows: 45, cols: 45, mode: 'highlight', speed: 1.3 },
      { rows: 115, cols: 115, mode: 'full', speed: 1.0 }
    ];

    let boundaryMaps = [];
    let frameCounter = 0;
    let totalFrames = 60;
    let capturer;
    let canvasElement;

    // preload equivalent
    p.preload = () => {
      // Use the global variable from index.html
      img = p.loadImage(window.imgDataURL);
    };

    // Setup
    p.setup = () => {
      let cnv = p.createCanvas(img.width, img.height);
      // Give it a parent in the HTML
      cnv.parent("sketch-container");

      // Slight performance hint for frequent pixel reads
      cnv.elt.getContext('2d', { willReadFrequently: true });
      canvasElement = cnv.elt;

      // Prepare the image
      img.loadPixels();
      createBoundaryMaps();

      // Construct layers
      for (let i = 0; i < numLayers; i++) {
        layers.push(
          new Layer(
            layerConfigs[i].rows,
            layerConfigs[i].cols,
            layerConfigs[i].mode,
            layerConfigs[i].speed,
            i
          )
        );
      }

      p.frameRate(24);

      // Setup CCapture
      capturer = new CCapture({
        format: 'gif',
        framerate: 24,
        workersPath: 'lib/',
        verbose: true,
        onComplete: function(blob) {
          let url = URL.createObjectURL(blob);
          let a = document.createElement('a');
          a.href = url;
          a.download = 'capture.gif';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      });

      createCaptureButton();
    };

    // Draw
    p.draw = () => {
      p.background(0);
      let t = frameCounter / totalFrames;

      // Update & display layers
      for (let i = 0; i < layers.length; i++) {
        layers[i].update(t);
        layers[i].display();
      }

      // Capture frames until we reach totalFrames
      if (frameCounter < totalFrames) {
        capturer.capture(canvasElement);
        frameCounter++;
      } else if (frameCounter === totalFrames) {
        capturer.stop();
        capturer.save();
        p.noLoop();
      }
    };

    // Create boundary maps
    function createBoundaryMaps() {
      for (let i = 0; i < numLayers; i++) {
        boundaryMaps[i] = [];
        for (let y = 0; y < img.height; y++) {
          boundaryMaps[i][y] = [];
          for (let x = 0; x < img.width; x++) {
            let index = (y * img.width + x) * 4;
            let b = p.brightness(
              p.color(img.pixels[index], img.pixels[index+1], img.pixels[index+2])
            );
            let boundary = false;

            if (x > 0) {
              let leftIndex = (y * img.width + (x - 1)) * 4;
              let lb = p.brightness(
                p.color(
                  img.pixels[leftIndex],
                  img.pixels[leftIndex + 1],
                  img.pixels[leftIndex + 2]
                )
              );
              if (p.abs(b - lb) > 20) boundary = true;
            }

            if (y > 0) {
              let topIndex = ((y - 1) * img.width + x) * 4;
              let tb = p.brightness(
                p.color(
                  img.pixels[topIndex],
                  img.pixels[topIndex + 1],
                  img.pixels[topIndex + 2]
                )
              );
              if (p.abs(b - tb) > 20) boundary = true;
            }

            boundaryMaps[i][y][x] = boundary ? 1 : 0;
          }
        }
      }
    }

    // Layer class
    class Layer {
      constructor(rows, cols, mode, speed, index) {
        this.rows = rows;
        this.cols = cols;
        this.mode = mode;
        this.speed = speed;
        this.index = index;
        this.nodes = [];
        this.initNodes();
      }

      initNodes() {
        for (let y = 0; y < this.rows; y++) {
          for (let x = 0; x < this.cols; x++) {
            let nx = p.map(x, 0, this.cols - 1, 0, p.width);
            let ny = p.map(y, 0, this.rows - 1, 0, p.height);
            this.nodes.push(new Node(nx, ny, this.mode, this.speed, this.index));
          }
        }
      }

      update(t) {
        for (let node of this.nodes) {
          node.update(boundaryMaps[this.index], t);
        }
      }

      display() {
        for (let node of this.nodes) {
          node.display();
        }
      }
    }

    // Node class
    class Node {
      constructor(x, y, mode, speed, layerIndex) {
        this.initX = x;
        this.initY = y;
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.mode = mode;
        this.layerIndex = layerIndex;
        this.offsetX = p.random(p.TWO_PI);
        this.offsetY = p.random(p.TWO_PI);
        this.size = 5;
      }

      update(boundaryMap, t) {
        let angle = p.TWO_PI * t;
        this.vx = p.cos(angle + this.offsetX) * this.speed;
        this.vy = p.sin(angle + this.offsetY) * this.speed;

        this.x = this.initX + this.vx * 100;
        this.y = this.initY + this.vy * 100;
        this.x = p.constrain(this.x, 0, p.width);
        this.y = p.constrain(this.y, 0, p.height);

        let imgX = p.floor(p.map(this.x, 0, p.width, 0, img.width));
        let imgY = p.floor(p.map(this.y, 0, p.height, 0, img.height));

        if (imgX < 0 || imgX >= img.width || imgY < 0 || imgY >= img.height) {
          this.vx *= -1;
          this.vy *= -1;
        } else {
          if (boundaryMap[imgY][imgX] === 1) {
            this.vx *= -1;
            this.vy *= -1;
          }

          let index = (imgY * img.width + imgX) * 4;
          let b = p.brightness(
            p.color(
              img.pixels[index],
              img.pixels[index + 1],
              img.pixels[index + 2]
            )
          );
          let baseSize = p.map(b, 0, 255, 1, 10);
          let layerFactor = p.map(this.layerIndex, 0, numLayers - 1, 1.5, 0.5);
          this.size = baseSize * layerFactor;
        }
      }

      display() {
        let shade;
        if (this.mode === 'shadow1' || this.mode === 'shadow2') {
          shade = p.map(this.layerIndex, 0, numLayers - 1, 50, 100);
        } else {
          shade = p.map(this.layerIndex, 0, numLayers - 1, 255, 100);
        }
        p.fill(shade, shade, shade, 200);
        p.noStroke();
        p.drawingContext.shadowBlur = p.map(shade, 0, 255, 0, 20);
        p.drawingContext.shadowColor = p.color(shade, shade, shade);
        p.ellipse(this.x, this.y, this.size);
      }
    }

    // Button to start capturing frames
    function createCaptureButton() {
      const button = p.createButton('Save GIF');
      // Place it just above the canvas
      button.position(10, 10);
      button.mousePressed(() => {
        if (capturer) {
          capturer.start();
          frameCounter = 0;
          p.loop();
        }
      });
    }

  }); // end new p5(...)
}