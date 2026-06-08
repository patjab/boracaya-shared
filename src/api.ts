export const ApiConstants = {
    // Invites
    GET_ALL_INVITES: 'https://s2yz8yv7ec.execute-api.us-east-1.amazonaws.com/production/invite?userId=lakandula',
    GET_INVITE: 'https://s05qxqhozf.execute-api.us-east-1.amazonaws.com/production/invite',
    CREATE_INVITES_BY_CSV_UPLOAD: 'https://s2yz8yv7ec.execute-api.us-east-1.amazonaws.com/production/scramble',
    INCREMENT_COUNT_OF_INVITE_SENT: 'https://s2yz8yv7ec.execute-api.us-east-1.amazonaws.com/production/scramble/increment',

    // RSVP
    GET_RSVPS: 'https://s4j7d5e84f.execute-api.us-east-1.amazonaws.com/production/rsvp',

    // Organizer / admin data
    GET_AND_PUT_ADMIN_ADDED_DATA_TO_RSVPS: 'https://s4j7d5e84f.execute-api.us-east-1.amazonaws.com/production/organize',

    // Pre-checkins (reservations)
    GET_PRECHECKINS: 'https://s4j7d5e84f.execute-api.us-east-1.amazonaws.com/production/pda-boracay-precheckins',

    // Save the date
    GET_SAVE_THE_DATE_RECORDS: 'https://yueask9uzc.execute-api.us-east-1.amazonaws.com/production/records',

    // Surveys
    GET_ALL_SURVEYS: 'https://survey.pdaboracay.com/surveys',
    GET_SURVEY_COUNTS: 'https://survey.pdaboracay.com/surveys/count',

    // IP tracking
    GET_IP_ADDRESSES: 'https://s2yz8yv7ec.execute-api.us-east-1.amazonaws.com/production',

    // Admin auth
    LOGIN: 'https://s2yz8yv7ec.execute-api.us-east-1.amazonaws.com/production/login',

    // Guestbook wishes
    WISHES: 'https://s05qxqhozf.execute-api.us-east-1.amazonaws.com/production/wishes',

    // Media upload (share app)
    INITIATE_UPLOAD: 'https://fj7gzz4jjg.execute-api.us-east-1.amazonaws.com/production/initiate',
    COMPLETE_UPLOAD: 'https://fj7gzz4jjg.execute-api.us-east-1.amazonaws.com/production/complete',
} as const;
