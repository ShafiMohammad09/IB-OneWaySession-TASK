import { Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable, map } from 'rxjs';


export interface Question {
  id: number;
  text: string;
}

@Injectable({
  providedIn: 'root'
})
export class GraphqlService {

  constructor(private apollo: Apollo) { }


  getQuestions(): Observable<Question[]> {
    return this.apollo
      .watchQuery<{ questions: Question[] }>({
        query: gql`
          query GetQuestions {
            questions {
              id
              text: question_text
            }
          }
        `,
      })
      .valueChanges.pipe(map((result) => (result.data?.questions as Question[]) || []));
  }
}
