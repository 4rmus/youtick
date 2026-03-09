/**
 * Generates a thumbnail image from a video file.
 * @param file The video file to extract a frame from.
 * @param seekTime The time in seconds to seek to (default: 1.0).
 * @returns A Promise that resolves to a Blob containing the thumbnail image (JPEG).
 */
export const CARD_THUMBNAIL_WIDTH = 480;
export const CARD_THUMBNAIL_HEIGHT = 270;
export const CARD_THUMBNAIL_QUALITY = 0.68;
export const POSTER_THUMBNAIL_WIDTH = 1280;
export const POSTER_THUMBNAIL_HEIGHT = 720;
export const POSTER_THUMBNAIL_QUALITY = 0.78;

export function getThumbnailDimensions(
    sourceWidth: number,
    sourceHeight: number,
    maxWidth: number = CARD_THUMBNAIL_WIDTH,
    maxHeight: number = CARD_THUMBNAIL_HEIGHT,
): { width: number; height: number } {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
        return { width: maxWidth, height: maxHeight };
    }

    const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);

    return {
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale)),
    };
}

export const generateVideoThumbnailVariant = async (
    file: File,
    options?: {
        seekTime?: number;
        maxWidth?: number;
        maxHeight?: number;
        quality?: number;
    },
): Promise<Blob> => {
    const seekTime = options?.seekTime ?? 1.0;
    const maxWidth = options?.maxWidth ?? CARD_THUMBNAIL_WIDTH;
    const maxHeight = options?.maxHeight ?? CARD_THUMBNAIL_HEIGHT;
    const quality = options?.quality ?? CARD_THUMBNAIL_QUALITY;

    return new Promise((resolve, reject) => {
        // Create a video element
        const video = document.createElement('video');

        // Create a URL for the file to set as the video source
        const fileUrl = URL.createObjectURL(file);
        video.preload = 'metadata';
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
                const { width, height } = getThumbnailDimensions(video.videoWidth, video.videoHeight, maxWidth, maxHeight);
                canvas.width = width;
                canvas.height = height;

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
                }, 'image/jpeg', quality);

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

export const generateVideoThumbnail = async (file: File, seekTime: number = 1.0): Promise<Blob> => {
    return await generateVideoThumbnailVariant(file, {
        seekTime,
        maxWidth: CARD_THUMBNAIL_WIDTH,
        maxHeight: CARD_THUMBNAIL_HEIGHT,
        quality: CARD_THUMBNAIL_QUALITY,
    });
};
