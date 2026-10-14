const fs = require('fs');

const events = JSON.parse(
    fs.readFileSync('events.json', 'utf8')
);

if (!Array.isArray(events)) {
    throw new Error('events.json must be an array');
}

const ids = events.map(e => e.id);
const unique = new Set(ids).size;

console.log('Total events:', events.length);
console.log('Unique events:', unique);

if (
    events.length > 0 &&
    events.length === unique &&
    ids.every(Boolean)
) {
    console.log('SUCCESS: No duplicate events!');
} else {
    console.log('WARNING: Duplicate or invalid events!');
}
