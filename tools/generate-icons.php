<?php
/**
 * Generates Angz app icons from Media/Logo.jpeg.
 *
 * The source is a 2816x1536 brand mockup, so we crop the square region that
 * holds just the mark (robot + growth arrow) rather than the photo backdrop,
 * then flatten the near-white studio background for a clean icon.
 *
 * Usage: php tools/generate-icons.php
 */

declare(strict_types=1);

const SOURCE = __DIR__ . '/../Media/Logo.jpeg';
const OUT_DIR = __DIR__ . '/../web/public/assets/icons';

// Square crop around the mark, in source pixels (source is 2816x1536).
const CROP_X = 1152;
const CROP_Y = 199;
const CROP_SIZE = 619;

// Trust Blue, the app's primary colour.
const TRUST_BLUE = [29, 78, 216];
const WHITE = 0xFFFFFF;

function fail(string $message): never
{
    fwrite(STDERR, "error: {$message}\n");
    exit(1);
}

if (!is_file(SOURCE)) {
    fail('source logo not found at ' . SOURCE);
}
if (!is_dir(OUT_DIR) && !mkdir(OUT_DIR, 0o777, true) && !is_dir(OUT_DIR)) {
    fail('could not create ' . OUT_DIR);
}

$source = imagecreatefromjpeg(SOURCE);
if ($source === false) {
    fail('could not read the JPEG');
}

/** Crops the mark and paints near-white pixels white so the icon reads cleanly. */
function extractMark(GdImage $source): GdImage
{
    $mark = imagecreatetruecolor(CROP_SIZE, CROP_SIZE);
    imagealphablending($mark, true);
    imagecopy($mark, $source, 0, 0, CROP_X, CROP_Y, CROP_SIZE, CROP_SIZE);

    // Any pixel already close to white is background: force it to pure white.
    for ($y = 0; $y < CROP_SIZE; $y++) {
        for ($x = 0; $x < CROP_SIZE; $x++) {
            $rgb = imagecolorat($mark, $x, $y);
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;

            if ($r > 226 && $g > 226 && $b > 226) {
                imagesetpixel($mark, $x, $y, WHITE);
            }
        }
    }

    return $mark;
}

/** Scales the mark onto a white square of the given size. */
function renderSquare(GdImage $mark, int $size, float $scale): GdImage
{
    $canvas = imagecreatetruecolor($size, $size);
    imagefill($canvas, 0, 0, WHITE);

    $target = (int) round($size * $scale);
    $offsetX = (int) round(($size - $target) / 2);
    $offsetY = (int) round(($size - $target) / 2);

    imagecopyresampled($canvas, $mark, $offsetX, $offsetY, 0, 0, $target, $target, CROP_SIZE, CROP_SIZE);

    return $canvas;
}

/** Maskable icons need a full-bleed brand background and a 20% safe zone. */
function renderMaskable(GdImage $mark, int $size): GdImage
{
    $canvas = imagecreatetruecolor($size, $size);
    imagefilledrectangle($canvas, 0, 0, $size, $size, imagecolorallocate($canvas, ...TRUST_BLUE));

    $inner = (int) round($size * 0.6);
    $offset = (int) round(($size - $inner) / 2);

    // Composite the mark over the brand background.
    imagecopyresampled($canvas, $mark, $offset, $offset, 0, 0, $inner, $inner, CROP_SIZE, CROP_SIZE);

    return $canvas;
}

$mark = extractMark($source);

$targets = [
    ['icon-192.png', 192, 0.86, false],
    ['icon-512.png', 512, 0.86, false],
    ['icon-maskable-512.png', 512, 0.0, true],
    ['apple-touch-icon-180.png', 180, 0.86, false],
    ['favicon-32.png', 32, 0.94, false],
];

foreach ($targets as [$filename, $size, $scale, $maskable]) {
    $canvas = $maskable ? renderMaskable($mark, $size) : renderSquare($mark, $size, $scale);
    $path = OUT_DIR . '/' . $filename;

    if (!imagepng($canvas, $path, 9)) {
        fail('could not write ' . $path);
    }

    printf("%-28s %4dx%-4d %6.1f KB\n", $filename, $size, $size, filesize($path) / 1024);
    imagedestroy($canvas);
}

imagedestroy($mark);
imagedestroy($source);

echo "\nIcons written to web/public/assets/icons\n";