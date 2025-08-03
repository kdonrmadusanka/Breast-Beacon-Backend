import numpy as np
import cv2
import pydicom
import json
import sys
import argparse
import os
from pathlib import Path
import logging
import datetime
from Crypto.Cipher import AES
from py_faster_rcnn.py_faster_rcnn.fast_rcnn.config import cfg
from py_faster_rcnn.py_faster_rcnn.fast_rcnn.test import im_detect
from py_faster_rcnn.py_faster_rcnn.fast_rcnn.nms_wrapper import nms
import caffe

# Add py_faster_rcnn directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'py_faster_rcnn'))

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("logs/mammogram_analysis.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Faster R-CNN configuration
cfg.TEST.SCALES = (1700,)
cfg.TEST.MAX_SIZE = 2100
cfg.TEST.HAS_RPN = True
cfg.TEST.NMS = 0.3
CONF_THRESH = 0.8

# Encryption settings
ENCRYPTION_KEY = os.environ.get("MAMMOGRAM_ENCRYPTION_KEY")
IV_LENGTH = 16  # AES-256-CBC

def decrypt_file(input_path, output_path):
    try:
        if not ENCRYPTION_KEY:
            raise ValueError("MAMMOGRAM_ENCRYPTION_KEY not set")
        with open(input_path, "rb") as f:
            data = f.read()
        iv = data[:IV_LENGTH]
        encrypted_data = data[IV_LENGTH:]
        cipher = AES.new(bytes.fromhex(ENCRYPTION_KEY), AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(encrypted_data)
        pad_len = decrypted[-1]
        decrypted = decrypted[:-pad_len]
        with open(output_path, "wb") as f:
            f.write(decrypted)
        logger.info(f"Decrypted: {input_path} -> {output_path}")
        return True
    except Exception as e:
        logger.error(f"Decryption failed: {str(e)}")
        return False

def preprocess_image(image_path, is_dicom):
    try:
        if is_dicom:
            ds = pydicom.dcmread(image_path)
            img = ds.pixel_array
            if ds.PhotometricInterpretation == "MONOCHROME1":
                img = img.max() - img
            img = 255.0 * img / img.max()
        else:
            img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
            img = 255.0 * img / img.max()
        im = np.zeros((img.shape[0], img.shape[1], 3), dtype=np.uint8)
        im[:, :, 0] = img
        im[:, :, 1] = img
        im[:, :, 2] = img
        return im
    except Exception as e:
        logger.error(f"Preprocessing failed for {image_path}: {str(e)}")
        raise

def load_net(prototxt_path, model_path):
    try:
        caffe.set_mode_cpu()
        net = caffe.Net(prototxt_path, model_path, caffe.TEST)
        logger.info(f"Loaded model: {model_path}")
        return net
    except Exception as e:
        logger.error(f"Model loading failed: {str(e)}")
        raise

def analyze_mammogram(image_path, is_dicom, prototxt_path, model_path):
    try:
        img = preprocess_image(image_path, is_dicom)
        net = load_net(prototxt_path, model_path)
        scores, boxes = im_detect(net, img)
        cls_ind = 1  # Lesion class
        cls_boxes = boxes[:, 4*cls_ind:4*(cls_ind+1)]
        cls_scores = scores[:, cls_ind]
        dets = np.hstack((cls_boxes, cls_scores[:, np.newaxis])).astype(np.float32)
        keep = nms(dets, cfg.TEST.NMS)
        dets = dets[keep, :]
        results = [
            {
                "bbox": {"x_min": float(det[0]), "y_min": float(det[1]), "x_max": float(det[2]), "y_max": float(det[3])},
                "confidence": float(det[-1])
            }
            for det in dets if det[-1] >= CONF_THRESH
        ]
        logger.info(f"Detected {len(results)} lesions in {image_path}")
        return results
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        raise

def main():
    parser = argparse.ArgumentParser(description="Mammogram lesion detection")
    parser.add_argument("--input", required=True, help="Encrypted mammogram path")
    parser.add_argument("--output", required=True, help="Decrypted file path")
    parser.add_argument("--prototxt", required=True, help="Prototxt file path")
    parser.add_argument("--model", required=True, help="Model weights path")
    parser.add_argument("--is_dicom", action="store_true", help="Input is DICOM")
    args = parser.parse_args()

    try:
        if not decrypt_file(args.input, args.output):
            sys.exit(1)
        results = analyze_mammogram(args.output, args.is_dicom, args.prototxt, args.model)
        output = {
            "status": "success",
            "detections": results,
            "image_path": args.input,
            "timestamp": datetime.datetime.now().isoformat()
        }
        print(json.dumps(output))
        os.remove(args.output)
        logger.info(f"Cleaned up: {args.output}")
    except Exception as e:
        output = {
            "status": "error",
            "message": str(e),
            "image_path": args.input,
            "timestamp": datetime.datetime.now().isoformat()
        }
        print(json.dumps(output))
        sys.exit(1)

if __name__ == "__main__":
    main()