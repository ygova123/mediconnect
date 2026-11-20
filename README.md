# MediConnect — HTML, CSS, and JavaScript

The ZIP contains two static web interfaces connected to the Firebase project supplied in `js/firebase.js`:

- `index.html` — patient-facing app with Firebase email/password and Google sign-in.
- `admin.html` — hospital, tag, city, general diet-plan, and PCOD/PCOS content management.

The interface uses plain HTML/CSS/JavaScript modules (with Vite only as a local static development/build server), Firebase Authentication, Realtime Database, Lucide icons, and responsive layouts. It does **not** use Firebase Storage.

## Folder structure

```text
mediconnect-html/
├── admin.html
├── assets/
│   ├── meal-breakfast.jpg
│   ├── meal-colorful-plate.jpg
│   ├── meal-grain-bowl.jpg
│   ├── meal-green-bowl.jpg
│   ├── hospital-corridor.jpg
│   ├── hospital-room.jpg
│   ├── care-team.jpg
│   └── woman-doctor.jpg
├── index.html
├── styles.css
├── package.json
├── vite.config.js
├── .gitignore
├── database.rules.json
├── PROMPT.md
├── README.md
└── js/
    ├── admin-app.js
    ├── data.js
    ├── firebase.js
    ├── icons.js
    ├── image-processing.js
    ├── sample-content.js
    └── user-app.js
```

## Configure Firebase before using the app

1. In the Firebase console for project `order-c0a7e`, enable **Email/Password** and **Google** under Authentication → Sign-in method.
2. Confirm Realtime Database is enabled. No Firebase Storage bucket or Storage rules are needed.
3. Publish `database.rules.json` as the Realtime Database rules. Catalog data can be read publicly; writes are restricted to authenticated UIDs whose `/admins/{uid}` value is `true`.
4. Create an administrator with Firebase Authentication. Copy their UID and add the value `true` at `/admins/{UID}` using the Firebase console. For example:

   ```json
   {
     "admins": {
       "YOUR_FIREBASE_AUTH_UID": true
     }
   }
   ```

   Admin membership is not editable from this website. The rules permit each signed-in user to read their own admin flag and forbid client writes to `/admins`.
5. Add the deployed domain and local hostname (`localhost`) to Authentication → Settings → Authorized domains.

Hospital photos are resized and encoded as JPEG data URLs in the browser. At most four compressed photos (350 KB each) are stored with each hospital record in Realtime Database. This avoids Firebase Storage, but image data increases Realtime Database storage and bandwidth usage; for a larger production directory, move image files to an authorized storage service.

The Firebase web API key is included as requested. Firebase web config is public; Realtime Database rules must be configured before production use.

## Run locally

Install Node.js 20+ and npm, then open a terminal in this folder:

```sh
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://localhost:5173`). Create a user account on the user page. For admin access, use the same Firebase account whose UID is in `/admins`, then open `/admin.html`.

Build static deployable output:

```sh
npm run build
npm run preview
```

The production files are generated in `dist/`.

## Deploy

- **Netlify:** deploy this folder as a Vite static site with build command `npm run build` and publish directory `dist`.
- **Vercel:** import the folder, use framework preset **Other**, build command `npm run build`, and output directory `dist`.

Add the deployed hostname to Firebase Authentication's authorized domains and publish the Realtime Database rules before enabling user sign-in or edits. The app loads Firebase and Lucide ES modules from their official CDNs, so deployed browsers need network access to those CDNs.

## Data written by the app

- `/hospitals/{id}`: name, district, city, address, hospitalType, specialties (array), openingHours, emergencyAvailable, rating, reviewsCount, hasNoReviews, summarizedReview, compressed image data URLs, appointmentAvailable, callPhoneNumber, tagIds, and timestamps.
- `/cities/{id}`: city name and updated timestamp.
- `/tags/{id}`: tag name, display color, and updated timestamp.
- `/dietPlans/{id}`: admin-authored goal, eating style, description, listed ingredients, meal ideas, and timestamps.
- `/dietQuestions/{kind}`: optional admin-customized prompt text for the fixed goal, eating-style, or ingredient-filter question.
- `/pcosGuide/guide`: PCOD/PCOS page headline, introduction, food suggestions, and precautions.
- `/pcosPlans/{id}`: admin-managed PCOD/PCOS meal inspiration and local photo selection.
- `/contentMeta/{key}`: admin-managed initialization markers used to seed and retain the sample content only once.
- `/admins/{uid}`: administrator boolean set manually in the Firebase console.

On the first authorized admin visit, sample general diet plans, a PCOD/PCOS guide, and sample PCOD/PCOS meal plans are added to Realtime Database if those collections are empty. They then appear in the admin editor and can be edited or deleted like other records. A one-time marker prevents deleted samples from reappearing. If no admin has visited yet, the user app displays the bundled sample plans and guide locally.

The Diet Plan page lets users browse meal ideas or receive matches based on their selected goal, eating style, and ingredients to avoid. Matching answers are processed in the browser only and are not written to Firebase or attached to the user profile. Questions can be reworded by an admin, but their answer choices stay fixed so matching remains meaningful. The PCOD/PCOS page includes admin-managed food suggestions, precautions, and popular meal plans. All diet content is general education, not medical advice; ingredient filtering does not guarantee allergy safety, and no plan claims to cure PCOS or guarantee health outcomes.

Food, hospital, and healthcare photographs are bundled locally so the application does not need an image API at runtime. Sources are Unsplash image IDs `photo-1512621776951-a57141f2eefd`, `photo-1490645935967-10de6ba17061`, `photo-1547592180-85f173990554`, `photo-1540420773420-3366772f4999`, `photo-1519494026892-80bbd2d6fd0d`, `photo-1559839734-2b71ea197ec2`, `photo-1576091160399-112ba8d25d1d`, and `photo-1587351021759-3e566b6af7cc`. See the [Unsplash license](https://unsplash.com/license) for usage terms.

Hospital images are compressed client-side to JPEG data URLs (maximum 350 KB per image, up to 4 per hospital) and stored in `/hospitals/{id}/images` in Realtime Database. Source images may be JPG, PNG, or WebP up to 15 MB. The rules allow only image keys `0`–`3` and limit each encoded image value to 500,000 characters.

## Prompt

See [PROMPT.md](./PROMPT.md) for a reusable, detailed prompt describing the same two applications and feature scope.
