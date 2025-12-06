/**
 * Generates a thumbnail image from a video file.
 * @param file The video file to extract a frame from.
 * @param seekTime The time in seconds to seek to (default: 1.0).
 * @returns A Promise that resolves to a Blob containing the thumbnail image (JPEG).
 */
export const generateVideoThumbnail = async (file: File, seekTime: number = 1.0): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        // Create a video element
        const video = document.createElement('video');

        // Create a URL for the file to set as the video source
        const fileUrl = URL.createObjectURL(file);
        video.src = fileUrl;

        // Mute video to avoid any accidental sound
        video.muted = true;

        // This is important for some browsers to allow seeking without playing
        video.playsInline = true;
        video.crossOrigin = 'anonymous'; // Not strictly needed for local file, but good practice

        // Event listener for when metadata is loaded (to know duration, dimensions)
        video.onloadedmetadata = () => {
            // Ensure we don't seek past the end
            if (seekTime > video.duration) {
                video.currentTime = video.duration / 2; // Middle frame if seekTime is too large
            } else {
                video.currentTime = seekTime;
            }
        };

        // Event listener for when the video has seeked to the frame
        video.onseeked = () => {
            try {
                // Create a canvas to draw the frame
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // Draw the video frame to the canvas
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Export canvas to Blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create thumbnail blob'));
                    }

                    // Cleanup
                    URL.revokeObjectURL(fileUrl);
                    video.remove();
                }, 'image/jpeg', 0.85); // JPEG with 85% quality

            } catch (error) {
                reject(error);
                URL.revokeObjectURL(fileUrl);
            }
        };

        // Handle errors
        video.onerror = () => {
            reject(new Error('Failed to load video file'));
            URL.revokeObjectURL(fileUrl);
        };
    });
};
