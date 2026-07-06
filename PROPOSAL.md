# MP3 Proposal — Exercise Library Browser

## What I'm building
A searchable exercise library that lets users browse exercises by muscle group or equipment, view detailed descriptions, and save favorites — designed to eventually merge with my workout tracker (MP2).

## Which API I'm using
MUSCLEWIKI - https://api.musclewiki.com/

## Why I chose this
My MP2 project is a full workout tracker with a hardcoded list. This project solves a real limitation of that app: users can't discover new exercises or learn how to perform them. By pulling from a real exercise database with muscle groups, equipment, and descriptions, I can eventually replace the static list with live data and add an "Add to Workout" button that passes exercises directly into the tracker.

## Core features
1. Browse all exercises in a card grid (paginated)
2. Search by exercise name, muscle, or keyword
3. Filter by muscle group (category) and equipment type
4. Click any card to open a detail modal with muscles worked, equipment, and full description
5. Save favorite exercises to localStorage — they persist across visits

## Extensions planned
- Favorites strip at the top of the page (quick access to saved exercises)
- Sort by name or muscle group
- Empty/loading/error states for all fetch scenarios

## What I don't know yet
- How to use an API key
- How to fetch data from API
- Loading, Error, and Empty States
- Using Vercel (server-side Code)