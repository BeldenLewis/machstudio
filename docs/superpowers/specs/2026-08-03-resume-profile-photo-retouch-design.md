# Resume Profile Photo Retouch Design

## Goal

Create a polished studio-style resume profile photo from `Lucian-profile.png` while preserving the subject's identity and professional, neutral expression.

## Approved Direction

- Preserve facial structure, features, hairstyle, pose, crop, and neutral expression.
- Keep the white studio background and dark suit, white shirt, and black tie.
- Apply restrained skin cleanup and tone balancing without plastic-looking blur.
- Tidy visible flyaway hairs and small clothing irregularities.
- Improve exposure, white balance, contrast, and selective sharpness for eyes, hair, and clothing.
- Keep the result photorealistic and suitable for a Korean resume or professional profile.

## Invariants

- Do not reshape the face, eyes, nose, mouth, jaw, or body.
- Do not change apparent age, ethnicity, hairstyle, expression, or wardrobe.
- Do not add makeup, accessories, text, logos, or a watermark.
- Do not crop out additional parts of the head or shoulders.
- Do not overwrite the source image.

## Output

- Produce one non-destructive PNG sibling named `Lucian-profile-retouched.png` in the source folder.
- Validate that the person remains immediately recognizable and that the retouching is subtle at normal viewing size.
