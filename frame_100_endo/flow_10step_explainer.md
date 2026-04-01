# ONN PoC Full Image Explainer (Single Frame)

This document explains every generated output image for one inference pass. The complete visual chart is [flow_10step_chart.png](flow_10step_chart.png), and metadata is in [00_summary.json](00_summary.json).

## Input and Preprocessing

### [01_input_bgr.png](01_input_bgr.png)
This is the raw laparoscopic RGB input frame before any optical simulation or model preprocessing. It is loaded directly from disk using OpenCV and preserved so every later artifact can be traced back to the original scene.

### [02_gray_clahe.png](02_gray_clahe.png)
This is the grayscale image after resizing to model input size and applying CLAHE contrast enhancement. It is computed as RGB-to-gray, then local histogram equalization, then normalized to the [0,1] range to stabilize downstream filter responses.

## Kernel Visuals (Raw and DMD-Ready)

### [03_kernel_sobel_x_raw_norm.png](03_kernel_sobel_x_raw_norm.png)
This shows the original Sobel-X kernel, min-max normalized only for display. It helps explain the horizontal gradient-sensitive operator used before intensity conversion.

### [03_kernel_sobel_x_dmd_ready.png](03_kernel_sobel_x_dmd_ready.png)
This is the Sobel-X kernel converted to an amplitude-only DMD-compatible mask. It is computed with h_dmd=(h-min(h))/(max(h)-min(h)), which removes negative values and scales to [0,1].

### [03_kernel_sobel_y_raw_norm.png](03_kernel_sobel_y_raw_norm.png)
This shows the original Sobel-Y kernel, normalized for visualization. It captures vertical gradient structure in the grayscale image.

### [03_kernel_sobel_y_dmd_ready.png](03_kernel_sobel_y_dmd_ready.png)
This is Sobel-Y after the same DMD mapping used in the optical pipeline. The transformation preserves relative pattern shape while enforcing non-negative modulation values.

### [03_kernel_laplacian_raw_norm.png](03_kernel_laplacian_raw_norm.png)
This visualizes the Laplacian kernel in normalized form for readability. It emphasizes second-order spatial variation and highlights sharp local intensity transitions.

### [03_kernel_laplacian_dmd_ready.png](03_kernel_laplacian_dmd_ready.png)
This is the Laplacian kernel after DMD conversion. As with Sobel masks, values are shifted and scaled so an amplitude-only modulator can represent the pattern.

## Simulated Optical Intensity Maps

### [04_feature_sobel_x_intensity.png](04_feature_sobel_x_intensity.png)
This is the Sobel-X optical feature channel after intensity simulation. It is computed as r_x=gray*h_x followed by I_x=|r_x|^2, then robust percentile normalization (1st to 99th percentile).

### [04_feature_sobel_y_intensity.png](04_feature_sobel_y_intensity.png)
This is the Sobel-Y intensity channel generated with the same process. It captures complementary edge structure to Sobel-X and forms one channel of the 3-channel optical tensor.

### [04_feature_laplacian_intensity.png](04_feature_laplacian_intensity.png)
This is the Laplacian intensity channel, sensitive to local curvature and abrupt boundaries. It follows the same response-to-intensity map: convolution response magnitude squared, then robust normalization.

### [04_feature_maps_tiled.png](04_feature_maps_tiled.png)
This tiled image stacks the three intensity channels side by side for quick comparison. It corresponds to the model input tensor channels [I_x, I_y, I_l] before entering the adapter.

## Adapter Outputs

### [05_adapter_ch0.png](05_adapter_ch0.png)
This is adapter output channel 0 after 1x1 convolution, batch normalization, and ReLU. It reflects how the learned adapter re-weights and calibrates optical channels for the pretrained DeepLab backbone.

### [05_adapter_ch1.png](05_adapter_ch1.png)
This is adapter output channel 1 with the same transformation stack. Differences from the input feature maps indicate learned feature mixing and distribution alignment.

### [05_adapter_ch2.png](05_adapter_ch2.png)
This is adapter output channel 2 from the calibrated optical representation. Together with channels 0 and 1, it forms the 3-channel tensor passed into DeepLab.

### [05_adapter_tiled.png](05_adapter_tiled.png)
This tile shows all three adapter channels together to highlight channel-wise changes after calibration. It is a direct visualization of the adapter tensor right before segmentation logits are computed.

## Class Probabilities

### [06_prob_class_0.png](06_prob_class_0.png)
This is the per-pixel probability map for reduced class 0. It is computed from logits using softmax: p_c=exp(z_c)/sum_j exp(z_j), so brighter regions indicate higher confidence for class 0.

### [06_prob_class_1.png](06_prob_class_1.png)
This is the probability map for reduced class 1 from the same softmax output tensor. It helps diagnose class competition and ambiguous boundaries.

### [06_prob_class_2.png](06_prob_class_2.png)
This is the probability map for reduced class 2. Relative brightness versus other class maps indicates where class 2 dominates the decision.

### [06_prob_class_3.png](06_prob_class_3.png)
This is the probability map for reduced class 3. It is particularly useful for debugging low-confidence regions where multiple classes have similar probabilities.

### [06_prob_tiled.png](06_prob_tiled.png)
This combines all class probability maps into one side-by-side panel. It is a compact diagnostic for understanding model confidence distribution across all reduced classes.

## Prediction and Visualization

### [07_pred_reduced_ids.png](07_pred_reduced_ids.png)
This is the hard prediction mask in reduced-class index space. It is computed as argmax over class probabilities per pixel.

### [08_pred_color_modelsize.png](08_pred_color_modelsize.png)
This is the colorized prediction mask at model resolution. Reduced class IDs are mapped back to original class IDs via new_to_old mapping, then converted to palette colors.

### [09_pred_color_origsize.png](09_pred_color_origsize.png)
This is the colorized mask upsampled to the original frame resolution for reporting. Nearest-neighbor interpolation is used to preserve label boundaries and avoid class mixing.

### [10_overlay_origsize.png](10_overlay_origsize.png)
This is the final visual output used for qualitative review. It is alpha blending of original RGB and resized color mask with default alpha=0.45.
