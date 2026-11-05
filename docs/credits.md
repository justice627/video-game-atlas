# Credits

Parts of the research pipeline's verification design adapt principles from a private engineering-guidance collection:

- the producer of a claim is never its only verifier, and the verifier sees the evidence, not the producer's reasoning (the fact-checker);
- verified output can't grow faster than verification capacity (review-queue backpressure);
- a skipped or unavailable check counts as uncertainty, never as success (blocked sources keep a link off the map);
- received source data keeps a checksum, and counts are reconciled before and after a load (evidence records, migrations);
- regression scenarios use deterministic graders (golden tests).

The ideas are restated here in this project's own words; no text or files were copied.

Data sources and their licences: see [data/LICENSE.md](../data/LICENSE.md).
