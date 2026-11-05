# Public test fixture for live AI acceptance

`tools/fixtures/ai/common-carp.jpg` is a public-domain photograph of **common carp, Cyprinus carpio**, by **Sam Stukel / USFWS**, photographed at Gavins Point National Fish Hatchery. It is a real photograph, not an illustration or generated image. It contains no application user's personal photograph.

Source and licence verified 2026-11-05:

- [US Fish and Wildlife Service original media page](https://www.fws.gov/media/common-carp-10) identifies Cyprinus carpio, credits Sam Stukel / USFWS and explicitly states **Public Domain**.
- [Wikimedia Commons file description and licence](https://commons.wikimedia.org/wiki/File:Common_Carp_(Cyprinus_carpio)_(3)_(51222524726).jpg) identifies the USFWS employee's official photograph and public-domain status; the source Flickr photo was licence-reviewed by Commons.
- Exact downloaded rendition: [Wikimedia 1280 × 640 JPEG](https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Common_Carp_%28Cyprinus_carpio%29_%283%29_%2851222524726%29.jpg/1280px-Common_Carp_%28Cyprinus_carpio%29_%283%29_%2851222524726%29.jpg).

This repository copies that publicly supplied rendition without image editing. Local inspection confirms JPEG, 1280 × 640, 112,763 bytes, non-progressive/baseline. The existing server metadata stripper accepts it. Sending this fixed fixture for a bounded inference test is distinct from sending a user's catch photo. Credit does not imply USFWS endorsement of ChytnuCz or the AI prediction.

SHA-256: `3a064f2a99847befdf13bcaf24c79e6abcc1538ccb7f5360001bd249160eb73b`.

Expected catalogue result for a clear recognition acceptance test: `commonCarp`. A successful test on one public photograph is not a calibrated accuracy study or evidence that all Czech species are reliably recognized. No length or weight should be inferred from it.
