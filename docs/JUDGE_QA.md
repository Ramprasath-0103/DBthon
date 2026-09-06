# Judge Q&A

Short, honest answers. Where something is unbuilt, say so — a judge will find out anyway.

### "What stops a man from signing up as a woman?"

Right now, nothing — gender is self-declared at registration, and we are not going to
pretend otherwise. What we built is the *enforcement layer* that a real check plugs into: a
Postgres trigger that refuses the insert, independent of the API. Swapping self-declaration
for phone-OTP or DigiLocker eKYC changes how `users.gender` gets set; it changes nothing
about how the write gate works. That is the part that is hard to retrofit, and it is done.

### "Why won't people just use Google Maps reviews?"

Two reasons. Google rates service quality across the whole population — a restaurant's
4.5 stars says nothing about walking to it alone. And Google has no time dimension: one
score per place, forever. Our entire premise is that a bus stop at 2pm and at 10pm are
different places, and our data shows a 1.8-point gap between them.

### "Isn't calling a business unsafe defamation?"

We never publish a score from fewer than three reviews, and that rule lives in the database
view, not in the UI. We publish aggregates on six neutral factors — lighting, how busy it
is, ease of leaving — not accusations. Review text is shown with no author and never names
an individual.

### "Doesn't this redline entire neighbourhoods?"

We thought about this early and it constrains the design. Colour is per venue only. There
is deliberately **no** area heat overlay, and we will not add one. A café can be green on a
street where the bus stop is red, and the map will show exactly that.

### "How do you get the first 10,000 reviews?"

We don't start city-wide. One campus, one hostel network — a population that already talks
to each other and already has the information informally. The minimum-3 rule means a place
needs three women, not three thousand, before it is useful. Vellore has enough students in
one square kilometre to make that tractable.

### "How do you handle trans and non-binary users?"

Registration has female, male and other. Today only `female` can post, which is the blunt
version and we know it. The better answer is a community-vouching path rather than a gender
field at all — someone already trusted vouches for you. We did not build it because it is
meaningless without a real user base to vouch.

### "What happens at a million users?"

Three things change, and none is a rewrite. The score view becomes a materialised view
refreshed on write. The mean becomes Bayesian shrinkage toward the global mean — one
expression in one migration, because the score is a view. And the GIST index on `geog`
starts earning its keep: at 75 locations Postgres correctly ignores it and does a
sequential scan, which we can show you in the query plan.

### If asked what is *not* built

Incident reporting, moderation tooling, saved places, real identity verification, rate
limiting, and deployment. All cut deliberately to make four demo beats work properly rather
than nine features work badly.
